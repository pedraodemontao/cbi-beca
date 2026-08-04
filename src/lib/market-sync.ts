import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketList, type BrapiListItem } from '@/lib/brapi';
import { getFundamentals, type BolsaiFailure } from '@/lib/bolsai';
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

/** Falhas que não adianta insistir: a próxima requisição erra igual. */
const HALTING_FAILURES: ReadonlySet<BolsaiFailure> = new Set<BolsaiFailure>([
  'missing_key',
  'rate_limited',
  'unauthorized',
]);

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

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

  const { data, error } = await supabase
    .from('companies')
    .select('ticker')
    .eq('asset_type', 'stock')
    .order('market_cap', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('Falha ao ler catálogo', error);
    return { ok: false, status: 500, error: 'Falha ao ler o catálogo.' };
  }

  const tickers = ((data ?? []) as { ticker: string }[]).map((row) => row.ticker);
  if (tickers.length === 0) {
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
