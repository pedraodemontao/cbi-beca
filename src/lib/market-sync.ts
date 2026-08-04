import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketList, type BrapiListItem } from '@/lib/brapi';
import { getFundamentals, getFiiList, type BolsaiFailure } from '@/lib/bolsai';
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

/** Quantas ações enriquecer por execução. O free da bolsai dá 200 req/dia. */
export const DEFAULT_FUNDAMENTALS_LIMIT = 400;

const CONCURRENCY = 6;

/** Fundamento gravado há menos de 7 dias não vale outra requisição. */
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
 * metade da cota diária de fundamentos se entrarem na fila.
 */
const FRACTIONAL_TICKER = /^[A-Z]{4}\d{1,2}F$/;

function toAssetType(item: BrapiListItem): MarketAssetType | null {
  if (item.type === 'stock') return 'stock';
  if (item.type === 'bdr') return 'bdr';
  // 'fund' abriga FII e ETF; só o FII entra no vocabulário do app.
  if (item.type === 'fund' && item.subType === 'fii') return 'fii';
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

  const rows = list.flatMap((item) => {
    const assetType = toAssetType(item);
    if (!assetType || !item.stock) return [];
    if (FRACTIONAL_TICKER.test(item.stock)) return [];
    return [
      {
        ticker: item.stock,
        name: item.name ?? item.stock,
        asset_type: assetType,
        sector: item.sector ?? null,
        subsector: item.subsector ?? null,
        logo_url: item.logo ?? null,
        price: toNumber(item.close),
        change_percent: toNumber(item.change),
        market_cap: toNumber(item.market_cap),
        volume: toNumber(item.volume),
        price_updated_at: capturedAt,
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

export interface FiiSyncSummary {
  received: number;
  saved: number;
  /** Quantos vieram sem yield — sem ele não existe preço teto de FII. */
  withoutYield: number;
}

/**
 * Rendimento dos FIIs, via `/fiis/` da bolsai.
 *
 * Cabe numa requisição só (o endpoint aceita `limit` até 5.000), o que importa
 * porque o plano free dá 200 por dia. FII não tem lucro por ação: o preço teto
 * dele sai do rendimento de 12 meses, que gravamos em `dividends_12m`.
 */
export async function syncFiis(limit = 500): Promise<SyncResult<FiiSyncSummary>> {
  const result = await getFiiList(limit);
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
    .select('ticker')
    .eq('asset_type', 'fii');
  const catalog = new Set(((known ?? []) as { ticker: string }[]).map((row) => row.ticker));

  let withoutYield = 0;
  const rows = result.data.flatMap((fii) => {
    const ticker = fii.ticker.toUpperCase();
    if (!catalog.has(ticker)) return [];
    if (fii.dividends12m === null) {
      withoutYield += 1;
      return [];
    }
    return [
      {
        ticker,
        dividends_12m: fii.dividends12m,
        vpa: fii.bookValuePerShare,
        price_to_book: fii.priceToBook,
      },
    ];
  });

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK);
    const { error } = await supabase
      .from('company_fundamentals')
      .upsert(chunk, { onConflict: 'ticker' });
    if (error) {
      console.error('Falha ao gravar FIIs', error);
      return { ok: false, status: 500, error: 'Falha ao gravar os FIIs.' };
    }
  }

  return {
    ok: true,
    data: { received: result.data.length, saved: rows.length, withoutYield },
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
      .gt('updated_at', staleThreshold()),
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
    .filter((ticker) => !alreadyFresh.has(ticker))
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

      const fundamentals = result.data;
      rows.push({
        ticker,
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
