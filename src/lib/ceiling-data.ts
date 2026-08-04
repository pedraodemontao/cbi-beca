import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppliedOverride,
  CeilingAsset,
  CeilingOverrideRow,
  CompanyFundamentalsRow,
  CompanyRow,
} from '@/types/ceiling';

/**
 * Leitura do que o preço teto precisa do banco.
 *
 * Mora aqui porque três telas consomem o mesmo par de tabelas: a tabela do
 * `/preco-teto`, o card da página de ativo e o alerta da carteira.
 */

type CompanyFields = Pick<
  CompanyRow,
  | 'ticker'
  | 'name'
  | 'sector'
  | 'logo_url'
  | 'price'
  | 'price_updated_at'
  | 'volume'
  | 'asset_type'
>;

type FundamentalFields = Pick<
  CompanyFundamentalsRow,
  'ticker' | 'net_income' | 'shares_outstanding' | 'vpa' | 'reference_date' | 'dividends_12m'
>;

const COMPANY_COLUMNS =
  'ticker,name,sector,logo_url,price,price_updated_at,volume,asset_type';
const FUNDAMENTAL_COLUMNS =
  'ticker,net_income,shares_outstanding,vpa,reference_date,dividends_12m';

interface FetchOptions {
  /** Quando informado, traz só esses tickers (página de ativo e carteira). */
  tickers?: string[];
  /** Teto de linhas quando o universo é a bolsa inteira. */
  limit?: number;
}

export async function fetchCeilingAssets(
  supabase: SupabaseClient,
  { tickers, limit }: FetchOptions = {}
): Promise<CeilingAsset[]> {
  // Duas consultas em vez de um join embutido: o PostgREST decide sozinho se a
  // relação vira objeto ou lista, e o casamento por ticker aqui é trivial.
  let companyQuery = supabase.from('companies').select(COMPANY_COLUMNS);
  let fundamentalQuery = supabase
    .from('company_fundamentals')
    .select(FUNDAMENTAL_COLUMNS);

  if (tickers) {
    if (tickers.length === 0) return [];
    companyQuery = companyQuery.in('ticker', tickers);
    fundamentalQuery = fundamentalQuery.in('ticker', tickers);
  } else {
    // BDR fica de fora: não tem balanço na CVM nem rendimento pra calcular teto.
    companyQuery = companyQuery
      .in('asset_type', ['stock', 'fii'])
      .order('market_cap', { ascending: false, nullsFirst: false });
    if (limit) companyQuery = companyQuery.limit(limit);
  }

  const [{ data: companyRows }, { data: fundamentalRows }] = await Promise.all([
    companyQuery,
    fundamentalQuery,
  ]);

  const fundamentals = new Map(
    ((fundamentalRows ?? []) as FundamentalFields[]).map((row) => [row.ticker, row])
  );

  return ((companyRows ?? []) as CompanyFields[]).flatMap((company) => {
    const fundamental = fundamentals.get(company.ticker);
    if (!fundamental) return [];
    return [
      {
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        logoUrl: company.logo_url,
        price: company.price,
        priceUpdatedAt: company.price_updated_at,
        volume: company.volume,
        netIncome: fundamental.net_income,
        sharesOutstanding: fundamental.shares_outstanding,
        vpa: fundamental.vpa,
        referenceDate: fundamental.reference_date,
        assetType: company.asset_type,
        dividends12m: fundamental.dividends_12m,
      },
    ];
  });
}

export interface TopPayer {
  ticker: string;
  name: string;
  assetType: 'stock' | 'fii';
  price: number;
  /** R$ por ação/cota nos últimos 12 meses. */
  dividends12m: number;
  /** Razão 0-1. */
  dividendYield: number;
  /** Rendimento acima do normal denuncia evento que não se repete. */
  isOutlier: boolean;
}

/** Acima disso quase nunca é lucro recorrente — é venda de ativo ou devolução
 *  de capital. Mesmo critério da tabela de preço teto. */
const OUTLIER_YIELD = 0.15;

/** Sem liquidez o preço fica velho e o yield vira ficção. */
const MIN_DAILY_TRADED = 1_000_000;

/**
 * Quem mais pagou dividendo em 12 meses, proporcionalmente ao próprio preço.
 *
 * O filtro de liquidez e a marcação de outlier acontecem aqui pra que a lista
 * nunca prometa um rendimento que a usuária não conseguiria capturar.
 */
export async function fetchTopPayers(
  supabase: SupabaseClient,
  limitPerType = 8
): Promise<{ stocks: TopPayer[]; fiis: TopPayer[]; excluded: number }> {
  const [{ data: companyRows }, { data: fundamentalRows }] = await Promise.all([
    supabase
      .from('companies')
      .select('ticker,name,asset_type,price,volume')
      .in('asset_type', ['stock', 'fii']),
    supabase
      .from('company_fundamentals')
      .select('ticker,dividends_12m')
      .gt('dividends_12m', 0),
  ]);

  const dividends = new Map(
    ((fundamentalRows ?? []) as { ticker: string; dividends_12m: number }[]).map(
      (row) => [row.ticker, row.dividends_12m]
    )
  );

  const all = ((companyRows ?? []) as (CompanyFields & { asset_type: 'stock' | 'fii' })[])
    .flatMap((company) => {
      const dividends12m = dividends.get(company.ticker);
      const price = company.price;
      if (!dividends12m || !price || price <= 0) return [];
      if ((company.volume ?? 0) * price < MIN_DAILY_TRADED) return [];

      const dividendYield = dividends12m / price;
      return [
        {
          ticker: company.ticker,
          name: company.name,
          assetType: company.asset_type,
          price,
          dividends12m,
          dividendYield,
          isOutlier: dividendYield > OUTLIER_YIELD,
        },
      ];
    })
    .sort((a, b) => b.dividendYield - a.dividendYield);

  // Sem tirar os extraordinários o ranking inteiro vira venda de ativo e
  // devolução de capital: o topo chegava a 63% ao ano, que ninguém recebe duas
  // vezes. A lista promete renda que tende a se repetir.
  const sustainable = all.filter((row) => !row.isOutlier);

  return {
    stocks: sustainable
      .filter((row) => row.assetType === 'stock')
      .slice(0, limitPerType),
    fiis: sustainable.filter((row) => row.assetType === 'fii').slice(0, limitPerType),
    excluded: all.length - sustainable.length,
  };
}

/**
 * Ajustes visíveis pra usuária logada. A RLS já entrega só os dela e os globais
 * da Beca; aqui o dela vence, porque a Beca dá o palpite e ela decide.
 */
export async function fetchAppliedOverrides(
  supabase: SupabaseClient
): Promise<Map<string, AppliedOverride>> {
  const { data } = await supabase
    .from('ceiling_overrides')
    .select('ticker,payout,manual_profit,user_id');

  const overrides = new Map<string, AppliedOverride>();
  for (const row of (data ?? []) as Pick<
    CeilingOverrideRow,
    'ticker' | 'payout' | 'manual_profit' | 'user_id'
  >[]) {
    const isGlobal = row.user_id === null;
    if (isGlobal && overrides.has(row.ticker)) continue;
    overrides.set(row.ticker, {
      ticker: row.ticker,
      payout: row.payout,
      manualProfit: row.manual_profit,
      isGlobal,
    });
  }
  return overrides;
}
