import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketList, type BrapiListItem } from '@/lib/brapi';
import {
  getFundamentals,
  getFundamentalsHistory,
  getFiiScreener,
  getStockDividends,
  getFiiDistributions,
  type BolsaiFailure,
  type DividendHistory,
} from '@/lib/bolsai';
import { getTrailingDividends, getPriceHistory } from '@/lib/yahoo';
import type { MarketAssetType } from '@/types/ceiling';

/**
 * Ingestão dos dados de mercado que alimentam o preço teto.
 *
 * Mora aqui, e não nas rotas, porque o plano Hobby da Vercel só permite dois
 * crons por projeto: as duas sincronizações rodam juntas em `/api/cron/market`,
 * mas continuam disparáveis em separado pra depurar.
 */

export type SyncResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

/** O Postgrest engasga com payload gigante; 2.000 linhas viram 4 lotes. */
const UPSERT_CHUNK = 500;

/**
 * Quantas ações enriquecer por execução.
 *
 * O free dava 200 requisições por dia e o catálogo tem 748 ações — a cauda
 * levava semanas pra entrar. Com o Pro (10.000/dia) o teto passa a ser o tempo
 * de execução da função na Vercel, não a cota.
 */
export const DEFAULT_FUNDAMENTALS_LIMIT = 800;

/** Quantos ativos buscar proventos por execução. */
export const DEFAULT_DIVIDENDS_LIMIT = 600;

const CONCURRENCY = 6;

/**
 * Trimestres que entram na mediana de lucro.
 *
 * Vinte = cinco anos, que cobre um ciclo inteiro de commodity. Menos que isso e
 * a "normalidade" seria só a bonança recente.
 */
const MEDIAN_QUARTERS = 20;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** O Yahoo não tem chave nem cota publicada, mas corta rajada com 429. */
const YAHOO_CONCURRENCY = 2;
const YAHOO_PAUSE_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Balanço gravado há menos de 7 dias não vale outra requisição.
 *
 * A comparação é contra `fundamentals_updated_at`, não `updated_at`: a linha de
 * `company_fundamentals` também é escrita pelas sincronizações de proventos e de
 * FII, e olhar pro carimbo genérico fazia ticker sem balanço nenhum parecer
 * fresco pra sempre.
 */
const FRESH_FUNDAMENTALS_DAYS = 7;

function staleThreshold(): string {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - FRESH_FUNDAMENTALS_DAYS);
  return threshold.toISOString();
}

/** Falhas que não adianta insistir: a próxima requisição erra igual. */
const HALTING_FAILURES: ReadonlySet<BolsaiFailure> = new Set<BolsaiFailure>([
  'missing_key',
  'rate_limited',
  'unauthorized',
]);

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Mercado fracionário: mesmo papel com "F" no fim (PETR4F). É a mesma empresa,
 * então duplica o catálogo — e a bolsai devolve 422 pra todos eles, torrando
 * cota de fundamentos à toa se entrarem na fila.
 *
 * Dois sinais, porque nenhum sozinho fecha. O formato pega o caso comum (letras,
 * dígito, F) mas erra em `MRSA6BF`, que é o fracionário de `MRSA6B` e não de
 * `MRSA6`. A presença do papel cheio no catálogo pega esse, mas erra quando a
 * brapi lista SÓ o fracionário — acontece em papel ilíquido como `AHEB5F`.
 *
 * Ticker brasileiro legítimo termina em dígito, nunca em letra, então exigir o
 * F final antes de qualquer coisa já elimina falso positivo.
 */
const FRACTIONAL_SHAPE = /^[A-Z][A-Z0-9]{2,}\d{1,2}F$/;

function isFractional(ticker: string, catalog: ReadonlySet<string>): boolean {
  if (!ticker.endsWith('F')) return false;
  return FRACTIONAL_SHAPE.test(ticker) || catalog.has(ticker.slice(0, -1));
}

/**
 * Formato que a bolsai aceita em `/fundamentals/{ticker}`: quatro caracteres e
 * até dois dígitos. Classes especiais da B3 como `MRSA5B` e `EQMA3B` ficam de
 * fora e devolvem 422 — não adianta pedir.
 */
const BOLSAI_TICKER = /^[A-Za-z][A-Za-z0-9]{3}\d{0,2}$/;

/**
 * Rótulo de cada tipo de fundo listado que entra no catálogo.
 *
 * Os três pagam renda mensal e usam a mesma conta de preço teto (rendimento ÷
 * yield desejado), então dividem o mesmo balde `asset_type = 'fii'`. Mas o selo
 * na tela precisa dizer o que a coisa é: Fiagro não é fundo imobiliário.
 *
 * ETF fica de fora — não distribui rendimento no Brasil, então não tem teto por
 * esse método.
 */
const FUND_LABELS: Record<string, string> = {
  fii: 'FII',
  'fi-agro': 'Fiagro',
  'fi-infra': 'FI-Infra',
};

interface CatalogClassification {
  assetType: MarketAssetType;
  /** Só existe pra fundo listado. */
  fundType: string | null;
}

function classify(item: BrapiListItem): CatalogClassification | null {
  if (item.type === 'stock') return { assetType: 'stock', fundType: null };
  if (item.type === 'bdr') return { assetType: 'bdr', fundType: null };
  if (item.type === 'fund') {
    const fundType = FUND_LABELS[item.subType ?? ''];
    if (fundType) return { assetType: 'fii', fundType };
  }
  return null;
}

export interface CatalogSyncSummary {
  total: number;
  byType: Record<string, number>;
}

/**
 * Atualiza ticker, nome, setor, logo e cotação de fechamento a partir de UMA
 * requisição à brapi. A cotação gravada aqui é rede de segurança — a tela usa
 * preço ao vivo e só cai pra este valor quando a brapi não responde.
 */
export async function syncCatalog(): Promise<SyncResult<CatalogSyncSummary>> {
  const list = await getMarketList();
  if (!list) {
    return { ok: false, status: 502, error: 'Catálogo indisponível na brapi.' };
  }

  const capturedAt = new Date().toISOString();
  const allTickers = new Set(list.flatMap((item) => item.stock ?? []));

  const rows = list.flatMap((item) => {
    const classified = classify(item);
    if (!classified || !item.stock) return [];
    const { assetType, fundType } = classified;
    if (isFractional(item.stock, allTickers)) return [];
    return [
      {
        ticker: item.stock,
        name: item.name ?? item.stock,
        asset_type: assetType,
        fund_type: fundType,
        sector: item.sector ?? null,
        subsector: item.subsector ?? null,
        logo_url: item.logo ?? null,
        price: toNumber(item.close),
        change_percent: toNumber(item.change),
        market_cap: toNumber(item.market_cap),
        volume: toNumber(item.volume),
        price_updated_at: capturedAt,
        // Carimbo de "a brapi ainda lista esse papel". Quem parar de aparecer
        // fica com a data velha e some da tela, sem ser apagado do banco.
        last_seen_at: capturedAt,
      },
    ];
  });

  if (rows.length === 0) {
    return { ok: false, status: 502, error: 'Catálogo veio vazio.' };
  }

  const supabase = createAdminClient();

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error } = await supabase.from('companies').upsert(chunk, { onConflict: 'ticker' });
    if (error) {
      console.error('Falha ao gravar catálogo', error);
      return { ok: false, status: 500, error: 'Falha ao gravar catálogo.' };
    }
  }

  const byType = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.asset_type] = (acc[row.asset_type] ?? 0) + 1;
    return acc;
  }, {});

  return { ok: true, data: { total: rows.length, byType } };
}

export interface DividendsSyncSummary {
  requested: number;
  saved: number;
  /** Ativos que não pagaram nada em 12 meses (ou que a fonte não conhece). */
  withoutDividends: number;
  /** Quantos precisaram do Yahoo porque a bolsai não tinha o ativo. */
  fromYahoo: number;
  /** Linhas gravadas em `dividend_payments`. */
  payments: number;
  /**
   * Tickers cujo histórico NÃO foi substituído porque o banco recusou algum
   * pagamento (valor fora da escala, duplicata). O histórico antigo deles
   * continua lá — a função SQL desfaz só aquele ticker.
   */
  paymentsFailed: string[];
}

/** O que `replace_dividend_payments` devolve. */
interface ReplaceOutcome {
  replaced: number;
  inserted: number;
  failed: { ticker: string; error: string }[];
}

/**
 * Tickers por chamada à função de substituição. ~500 tickers com ~30
 * pagamentos cada dão ~1,5 MB de JSON; 100 por lote mantém cada requisição
 * pequena sem virar uma por ticker.
 */
const REPLACE_BATCH = 100;

/** Linha de `dividend_payments` pronta pro banco. */
interface PaymentRow {
  ticker: string;
  ex_date: string;
  payment_date: string | null;
  type: string;
  value_per_share: number;
}

/** A coluna é NOT NULL: provento sem rótulo entra com o genérico. */
const DEFAULT_PAYMENT_TYPE = 'Provento';

/** `2026-06-02T00:00:00.000Z` e `2026-06-02` viram a mesma coisa. */
function toDateOnly(value: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

/**
 * Pagamentos individuais, sem duplicata.
 *
 * A chave primária é (ticker, data-com, tipo, valor), então dois lançamentos
 * idênticos no mesmo dia derrubariam o insert inteiro do lote.
 */
function toPaymentRows(ticker: string, history: DividendHistory): PaymentRow[] {
  const byKey = new Map<string, PaymentRow>();

  for (const payment of history.payments) {
    const exDate = toDateOnly(payment.exDate);
    if (!exDate) continue;

    const row: PaymentRow = {
      ticker,
      ex_date: exDate,
      payment_date: toDateOnly(payment.paymentDate),
      type: payment.type ?? DEFAULT_PAYMENT_TYPE,
      value_per_share: payment.valuePerShare,
    };
    byKey.set(`${row.ex_date}|${row.type}|${row.value_per_share}`, row);
  }

  return [...byKey.values()];
}

/**
 * Proventos pagos, da bolsai, pra ações E FIIs.
 *
 * Grava duas coisas: o resumo em `company_fundamentals` (12 meses e média dos
 * anos fechados, que é o que o Bazin e o preço teto de FII consomem) e cada
 * pagamento em `dividend_payments`, com data-com e data de depósito — é isso que
 * faz "próximos proventos" e "quanto já pingou" funcionarem pra qualquer ticker
 * do catálogo, e não só pros quatro de sandbox da brapi.
 *
 * O Yahoo continua como rede: ativo que a bolsai não conhece ainda entra pelo
 * caminho antigo, marcado na coluna `dividends_source`.
 */
export async function syncDividends(
  limit = DEFAULT_DIVIDENDS_LIMIT
): Promise<SyncResult<DividendsSyncSummary>> {
  const supabase = createAdminClient();

  // FII primeiro: sem rendimento ele simplesmente não tem preço teto, enquanto a
  // ação ainda aparece pelo lucro nos outros métodos.
  const { data, error } = await supabase
    .from('companies')
    .select('ticker,asset_type')
    .in('asset_type', ['fii', 'stock'])
    .order('asset_type', { ascending: true })
    .order('market_cap', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('Falha ao ler catálogo', error);
    return { ok: false, status: 500, error: 'Falha ao ler o catálogo.' };
  }

  // Classe especial da B3 (`MRSA5B`, `EQMA3B`) devolve 422 aqui igual devolve em
  // `/fundamentals` — pedir só gasta tempo e polui o log.
  const catalog = ((data ?? []) as { ticker: string; asset_type: string }[]).filter(
    (row) => BOLSAI_TICKER.test(row.ticker)
  );
  if (catalog.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'Catálogo vazio — rode a sincronização de catálogo primeiro.',
    };
  }

  const summaryRows: Record<string, unknown>[] = [];
  const paymentRows: PaymentRow[] = [];
  const touchedTickers: string[] = [];
  let withoutDividends = 0;
  let fromYahoo = 0;
  let halted: BolsaiFailure | null = null;

  const queue = [...catalog].reverse();

  async function worker() {
    for (;;) {
      if (halted) return;
      const company = queue.pop();
      if (!company) return;

      const { ticker, asset_type: assetType } = company;
      const result =
        assetType === 'fii'
          ? await getFiiDistributions(ticker)
          : await getStockDividends(ticker);

      if (result.ok && (result.data.ttmPerShare ?? 0) > 0) {
        const history = result.data;
        summaryRows.push({
          ticker,
          dividends_12m: history.ttmPerShare,
          dividends_5y_avg: history.averagePerYear,
          dividends_years: history.averageYears,
          dividend_yield_ttm: history.dividendYieldTtm,
          dividends_source: 'bolsai',
        });
        touchedTickers.push(ticker);
        paymentRows.push(...toPaymentRows(ticker, history));
        continue;
      }

      if (!result.ok && HALTING_FAILURES.has(result.reason)) {
        halted = result.reason;
        return;
      }

      // A bolsai não tem o ativo (ou ele não paga nada). O Yahoo ainda pode
      // conhecer — vale uma tentativa antes de desistir.
      const fallback = await getTrailingDividends(ticker);
      await sleep(YAHOO_PAUSE_MS);
      if (!fallback || fallback.total12m <= 0) {
        withoutDividends += 1;
        continue;
      }

      fromYahoo += 1;
      summaryRows.push({
        ticker,
        dividends_12m: fallback.total12m,
        dividends_5y_avg: fallback.average5y,
        dividends_years: 5,
        dividends_source: 'yahoo',
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, catalog.length) }, () => worker())
  );

  for (let index = 0; index < summaryRows.length; index += UPSERT_CHUNK) {
    const chunk = summaryRows.slice(index, index + UPSERT_CHUNK);
    const { error: upsertError } = await supabase
      .from('company_fundamentals')
      .upsert(chunk, { onConflict: 'ticker' });
    if (upsertError) {
      console.error('Falha ao gravar dividendos', upsertError);
      return { ok: false, status: 500, error: 'Falha ao gravar os dividendos.' };
    }
  }

  // Substituição por ticker, não upsert: o valor faz parte da chave primária,
  // então um pagamento revisado na fonte viraria linha nova em vez de corrigir a
  // antiga — e a renda da usuária apareceria contada duas vezes.
  //
  // A substituição é ATÔMICA POR TICKER, na função SQL `replace_dividend_payments`
  // (migration 0020). A versão anterior fazia `delete in (…)` e depois `insert`
  // em blocos, sem transação: um valor que o banco recusasse derrubava o bloco
  // de 500 linhas inteiro, e todos os tickers dele — e dos blocos seguintes —
  // ficavam sem nenhum pagamento até a próxima rodada. Agora o ticker ruim
  // volta ao estado anterior sozinho, vem nomeado em `paymentsFailed`, e os
  // outros seguem.
  const paymentsByTicker = new Map<string, PaymentRow[]>();
  for (const row of paymentRows) {
    const list = paymentsByTicker.get(row.ticker) ?? [];
    list.push(row);
    paymentsByTicker.set(row.ticker, list);
  }

  const paymentsFailed: string[] = [];
  let paymentsInserted = 0;

  for (let index = 0; index < touchedTickers.length; index += REPLACE_BATCH) {
    const batch = touchedTickers.slice(index, index + REPLACE_BATCH).map((ticker) => ({
      ticker,
      payments: (paymentsByTicker.get(ticker) ?? []).map((row) => ({
        ex_date: row.ex_date,
        payment_date: row.payment_date,
        type: row.type,
        value_per_share: row.value_per_share,
      })),
    }));

    const { data: outcome, error: rpcError } = await supabase.rpc('replace_dividend_payments', {
      batch,
    });
    if (rpcError) {
      console.error('Falha ao substituir pagamentos', rpcError);
      return { ok: false, status: 500, error: 'Falha ao gravar os proventos.' };
    }

    const result = outcome as ReplaceOutcome;
    paymentsInserted += result.inserted;
    for (const failure of result.failed) {
      paymentsFailed.push(failure.ticker);
      console.error(`Pagamentos de ${failure.ticker} mantidos como estavam: ${failure.error}`);
    }
  }

  if (halted) {
    return {
      ok: false,
      status: halted === 'rate_limited' ? 429 : 502,
      error: `Sincronização de proventos parou (${halted}).`,
    };
  }

  return {
    ok: true,
    data: {
      requested: catalog.length,
      saved: summaryRows.length,
      withoutDividends,
      fromYahoo,
      payments: paymentsInserted,
      paymentsFailed,
    },
  };
}

export interface PriceHistorySyncSummary {
  requested: number;
  saved: number;
}

/**
 * Fechamentos dos últimos 30 dias, pra sparkline.
 *
 * Só cobre quem tem liquidez: papel que não negocia desenha uma linha reta que
 * não diz nada, e cada ativo custa uma requisição.
 */
export async function syncPriceHistory(
  limit = 200
): Promise<SyncResult<PriceHistorySyncSummary>> {
  const supabase = createAdminClient();

  // `name` e `asset_type` vêm junto porque o upsert do PostgREST monta um INSERT
  // antes de cair no ON CONFLICT, e os dois são NOT NULL.
  const { data, error } = await supabase
    .from('companies')
    .select('ticker,name,asset_type')
    .in('asset_type', ['stock', 'fii'])
    .not('volume', 'is', null)
    .order('volume', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Falha ao ler catálogo', error);
    return { ok: false, status: 500, error: 'Falha ao ler o catálogo.' };
  }

  const catalog = (data ?? []) as {
    ticker: string;
    name: string;
    asset_type: string;
  }[];
  if (catalog.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'Catálogo vazio — rode a sincronização de catálogo primeiro.',
    };
  }

  const tickers = catalog.map((row) => row.ticker);
  const rows: {
    ticker: string;
    name: string;
    asset_type: string;
    price_history: number[];
  }[] = [];
  const queue = [...catalog].reverse();

  async function worker() {
    for (;;) {
      const company = queue.pop();
      if (!company) return;

      const history = await getPriceHistory(company.ticker);
      if (history && history.length > 1) {
        rows.push({ ...company, price_history: history });
      }
      await sleep(YAHOO_PAUSE_MS);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(YAHOO_CONCURRENCY, tickers.length) }, () => worker())
  );

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error: upsertError } = await supabase
      .from('companies')
      .upsert(chunk, { onConflict: 'ticker' });
    if (upsertError) {
      console.error('Falha ao gravar histórico de preço', upsertError);
      return { ok: false, status: 500, error: 'Falha ao gravar o histórico de preço.' };
    }
  }

  return { ok: true, data: { requested: tickers.length, saved: rows.length } };
}

export interface FiiSyncSummary {
  received: number;
  saved: number;
  /** Vieram no screener mas não estão no catálogo da brapi. */
  outsideCatalog: number;
}

/**
 * Ficha dos FIIs, via `/fiis/screener` da bolsai — duas requisições pros 551.
 *
 * Traz patrimônio por cota, P/VP e segmento. NÃO traz rendimento: o
 * `dividend_yield_ttm` do screener volta corrompido (RURA11 devolveu 3,4e15 em
 * 2026-08-05) e o `dy_month_pct` tem outlier de 254% ao mês. O rendimento — que
 * é o que dá o preço teto de FII — vem de `syncDividends`, que lê a série mensal
 * de `/fiis/{ticker}/distributions`.
 *
 * O endpoint `/fiis/` (que o plano free servia) não entra mais: devolve só nome,
 * segmento e número de cotistas, nenhum dado financeiro.
 */
export async function syncFiis(): Promise<SyncResult<FiiSyncSummary>> {
  const result = await getFiiScreener();
  if (!result.ok) {
    return {
      ok: false,
      status: result.reason === 'rate_limited' ? 429 : 502,
      error: `Não consegui ler os FIIs na bolsai (${result.reason}).`,
    };
  }

  const supabase = createAdminClient();

  // Só grava FII que já está no catálogo: `company_fundamentals` referencia
  // `companies`, e o catálogo é quem define o que a tela mostra.
  const { data: known } = await supabase
    .from('companies')
    .select('ticker,name,asset_type')
    .eq('asset_type', 'fii');
  const catalog = new Map(
    ((known ?? []) as { ticker: string; name: string; asset_type: string }[]).map((row) => [
      row.ticker,
      row,
    ])
  );

  const fundamentalRows: Record<string, unknown>[] = [];
  // `name` e `asset_type` vão junto porque o upsert do PostgREST monta um INSERT
  // antes de cair no ON CONFLICT, e as duas colunas são NOT NULL.
  const companyRows: Record<string, unknown>[] = [];
  let outsideCatalog = 0;

  for (const fii of result.data) {
    const known = catalog.get(fii.ticker);
    if (!known) {
      outsideCatalog += 1;
      continue;
    }

    companyRows.push({
      ticker: fii.ticker,
      name: known.name,
      asset_type: known.asset_type,
      segment: fii.segment,
    });
    fundamentalRows.push({
      ticker: fii.ticker,
      corporate_name: fii.name,
      reference_date: fii.referenceDate,
      shares_outstanding:
        fii.sharesOutstanding === null ? null : Math.round(fii.sharesOutstanding),
      equity: fii.netAssetValue,
      vpa: fii.bookValuePerShare,
      price_to_book: fii.priceToBook,
    });
  }

  for (let index = 0; index < companyRows.length; index += UPSERT_CHUNK) {
    const { error } = await supabase
      .from('companies')
      .upsert(companyRows.slice(index, index + UPSERT_CHUNK), { onConflict: 'ticker' });
    if (error) {
      console.error('Falha ao gravar segmento dos FIIs', error);
      return { ok: false, status: 500, error: 'Falha ao gravar os FIIs.' };
    }
  }

  for (let index = 0; index < fundamentalRows.length; index += UPSERT_CHUNK) {
    const { error } = await supabase
      .from('company_fundamentals')
      .upsert(fundamentalRows.slice(index, index + UPSERT_CHUNK), { onConflict: 'ticker' });
    if (error) {
      console.error('Falha ao gravar FIIs', error);
      return { ok: false, status: 500, error: 'Falha ao gravar os FIIs.' };
    }
  }

  return {
    ok: true,
    data: {
      received: result.data.length,
      saved: fundamentalRows.length,
      outsideCatalog,
    },
  };
}

export interface FundamentalsSyncSummary {
  requested: number;
  saved: number;
  failures: Partial<Record<BolsaiFailure, number>>;
  /** Preenchido quando a cota do dia estourou ou a chave não vale. */
  halted: BolsaiFailure | null;
}

/**
 * Enriquece as ações do catálogo com os fundamentos da CVM.
 *
 * A bolsai não aceita lote: uma requisição por ticker. Por isso o universo vem
 * ordenado por valor de mercado — se a cota acabar no meio do caminho, as
 * empresas que a usuária realmente procura já estão no banco.
 */
export async function syncFundamentals(
  limit: number = DEFAULT_FUNDAMENTALS_LIMIT
): Promise<SyncResult<FundamentalsSyncSummary>> {
  const supabase = createAdminClient();

  const [{ data, error }, { data: fresh }] = await Promise.all([
    supabase
      .from('companies')
      .select('ticker')
      .eq('asset_type', 'stock')
      .order('market_cap', { ascending: false, nullsFirst: false }),
    supabase
      .from('company_fundamentals')
      .select('ticker')
      .gt('fundamentals_updated_at', staleThreshold()),
  ]);

  if (error) {
    console.error('Falha ao ler catálogo', error);
    return { ok: false, status: 500, error: 'Falha ao ler o catálogo.' };
  }

  // Balanço só muda quando sai ITR novo: reconsultar quem já está fresco
  // torraria a cota diária sem trazer número nenhum.
  const alreadyFresh = new Set(
    ((fresh ?? []) as { ticker: string }[]).map((row) => row.ticker)
  );

  const tickers = ((data ?? []) as { ticker: string }[])
    .map((row) => row.ticker)
    .filter((ticker) => !alreadyFresh.has(ticker) && BOLSAI_TICKER.test(ticker))
    .slice(0, limit);
  if (tickers.length === 0) {
    if (alreadyFresh.size > 0) {
      return {
        ok: true,
        data: { requested: 0, saved: 0, failures: {}, halted: null },
      };
    }
    return {
      ok: false,
      status: 409,
      error: 'Catálogo vazio — rode a sincronização de catálogo primeiro.',
    };
  }

  const rows: Record<string, unknown>[] = [];
  const failures: Partial<Record<BolsaiFailure, number>> = {};
  let halted: BolsaiFailure | null = null;

  const queue = [...tickers].reverse();

  async function worker() {
    for (;;) {
      if (halted) return;
      const ticker = queue.pop();
      if (!ticker) return;

      const result = await getFundamentals(ticker);
      if (!result.ok) {
        failures[result.reason] = (failures[result.reason] ?? 0) + 1;
        if (HALTING_FAILURES.has(result.reason)) halted = result.reason;
        continue;
      }

      // A mediana histórica é o que separa lucro normal de pico. Custa uma
      // requisição a mais por ticker — com 10.000 por dia, cabe. Falhar aqui
      // não invalida o balanço: a linha entra sem a mediana.
      const history = await getFundamentalsHistory(ticker);
      const quarters = history.ok
        ? history.data
            .slice(0, MEDIAN_QUARTERS)
            .map((point) => point.netIncome)
            .filter((value): value is number => value !== null)
        : [];

      const fundamentals = result.data;
      rows.push({
        ticker,
        fundamentals_updated_at: new Date().toISOString(),
        net_income_median: median(quarters),
        net_income_median_quarters: quarters.length,
        cvm_code: fundamentals.cvmCode,
        corporate_name: fundamentals.corporateName,
        reference_date: fundamentals.referenceDate,
        shares_outstanding:
          fundamentals.sharesOutstanding === null
            ? null
            : Math.round(fundamentals.sharesOutstanding),
        net_income: fundamentals.netIncome,
        equity: fundamentals.equity,
        lpa: fundamentals.lpa,
        vpa: fundamentals.vpa,
        roe: fundamentals.roe,
        price_earnings: fundamentals.priceEarnings,
        price_to_book: fundamentals.priceToBook,
        net_margin: fundamentals.netMargin,
        net_debt_ebitda: fundamentals.netDebtEbitda,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tickers.length) }, () => worker())
  );

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error: upsertError } = await supabase
      .from('company_fundamentals')
      .upsert(chunk, { onConflict: 'ticker' });
    if (upsertError) {
      console.error('Falha ao gravar fundamentos', upsertError);
      return { ok: false, status: 500, error: 'Falha ao gravar fundamentos.' };
    }
  }

  return {
    ok: true,
    data: { requested: tickers.length, saved: rows.length, failures, halted },
  };
}
