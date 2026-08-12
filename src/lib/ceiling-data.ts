import 'server-only';
import { fetchAllRows } from '@/lib/supabase/paginate';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AppliedOverride,
  CeilingAsset,
  CeilingOverrideRow,
  CompanyFundamentalsRow,
  CompanyRow,
} from '@/types/ceiling';

/**
 * Ticker que a brapi não lista há mais que isso saiu de negociação (ou mudou de
 * código) e some das telas. A janela é folgada porque o cron é diário e uma
 * falha pontual não pode esvaziar o catálogo.
 */
const STALE_LISTING_DAYS = 10;

/** Exportada porque o casamento de ticker das notícias usa a mesma régua. */
export function listedSince(): string {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - STALE_LISTING_DAYS);
  return threshold.toISOString();
}

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
  | 'segment'
  | 'fund_type'
  | 'logo_url'
  | 'price'
  | 'price_updated_at'
  | 'volume'
  | 'asset_type'
  | 'price_history'
>;

type FundamentalFields = Pick<
  CompanyFundamentalsRow,
  | 'ticker'
  | 'net_income'
  | 'shares_outstanding'
  | 'vpa'
  | 'reference_date'
  | 'dividends_12m'
  | 'dividends_5y_avg'
  | 'dividends_years'
  | 'net_income_median'
  | 'net_income_median_quarters'
>;

const COMPANY_COLUMNS =
  'ticker,name,sector,segment,fund_type,logo_url,price,price_updated_at,volume,asset_type,price_history';
const FUNDAMENTAL_COLUMNS =
  'ticker,net_income,shares_outstanding,vpa,reference_date,dividends_12m,dividends_5y_avg,dividends_years,net_income_median,net_income_median_quarters';

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
    // Papel que saiu de listagem também: o preço dele congelou no dia em que
    // sumiu, e margem calculada em cima disso é ficção.
    companyQuery = companyQuery
      .in('asset_type', ['stock', 'fii'])
      .gte('last_seen_at', listedSince())
      .order('market_cap', { ascending: false, nullsFirst: false });
    if (limit) companyQuery = companyQuery.limit(limit);
  }

  // A de fundamentos vai paginada: são 747 linhas hoje contra o teto de 1.000
  // do PostgREST, e toda empresa sem fundamento correspondente é DESCARTADA em
  // silêncio no `flatMap` abaixo. Sem isso, ativos começariam a sumir da tabela
  // sem erro nenhum assim que o catálogo passasse de mil.
  const [{ data: companyRows }, fundamentalRows] = await Promise.all([
    companyQuery,
    fetchAllRows<FundamentalFields>((from, to) => fundamentalQuery.range(from, to)),
  ]);

  const fundamentals = new Map(fundamentalRows.map((row) => [row.ticker, row]));

  return ((companyRows ?? []) as CompanyFields[]).flatMap((company) => {
    const fundamental = fundamentals.get(company.ticker);
    if (!fundamental) return [];
    return [
      {
        ticker: company.ticker,
        name: company.name,
        sector: company.sector,
        segment: company.segment,
        fundType: company.fund_type,
        logoUrl: company.logo_url,
        price: company.price,
        priceUpdatedAt: company.price_updated_at,
        volume: company.volume,
        // O Postgres devolve numeric[] como string[]; a sparkline quer número.
        priceHistory:
          company.price_history?.map((value) => Number(value)).filter(Number.isFinite) ??
          null,
        netIncome: fundamental.net_income,
        sharesOutstanding: fundamental.shares_outstanding,
        vpa: fundamental.vpa,
        referenceDate: fundamental.reference_date,
        assetType: company.asset_type,
        dividends12m: fundamental.dividends_12m,
        dividends5yAvg: fundamental.dividends_5y_avg,
        dividendsYears: fundamental.dividends_years,
        netIncomeMedian: fundamental.net_income_median,
        netIncomeMedianQuarters: fundamental.net_income_median_quarters,
      },
    ];
  });
}

/** Um fundo pronto pra simulação: preço e rendimento por cota. */
export interface FiiOption {
  ticker: string;
  name: string;
  price: number;
  /** R$ por cota nos últimos 12 meses. */
  dividends12m: number;
}

/**
 * FIIs que a calculadora de renda oferece.
 *
 * Existe pra que a simulação não peça número nenhum à usuária: escolhendo o
 * fundo, cotação e rendimento vêm do banco. A calculadora avulsa que circula por
 * aí precisa que a pessoa cole um token da brapi justamente porque não tem base
 * própria — aqui isso não faz falta.
 *
 * Sem piso de liquidez, ao contrário da tabela de preço teto: lá o filtro
 * protege um RANKING que a usuária percorre sem escolher, e papel parado subia
 * ao topo com margem inventada. Aqui ela digita um ticker que já conhece —
 * esconder o fundo que ela tem seria pior que mostrar um preço defasado, ainda
 * mais porque a cotação é editável.
 */
export async function fetchFiiOptions(supabase: SupabaseClient): Promise<FiiOption[]> {
  const [{ data: companyRows }, fundamentalRows] = await Promise.all([
    supabase
      .from('companies')
      .select('ticker,name,price')
      .eq('asset_type', 'fii')
      .gt('price', 0)
      .gte('last_seen_at', listedSince()),
    fetchAllRows<{ ticker: string; dividends_12m: number }>((from, to) =>
      supabase
        .from('company_fundamentals')
        .select('ticker,dividends_12m')
        .gt('dividends_12m', 0)
        .range(from, to)
    ),
  ]);

  const dividends = new Map(
    fundamentalRows.map((row) => [row.ticker, Number(row.dividends_12m)])
  );

  return ((companyRows ?? []) as { ticker: string; name: string; price: number }[])
    .flatMap((company) => {
      const dividends12m = dividends.get(company.ticker);
      const price = Number(company.price);
      if (!dividends12m || !price) return [];
      return [{ ticker: company.ticker, name: company.name, price, dividends12m }];
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
}

/** Uma ação pronta pra simulação de renda. */
export interface StockOption {
  ticker: string;
  name: string;
  sector: string | null;
  logoUrl: string | null;
  price: number;
  /** R$ por ação nos últimos 12 meses. */
  dividends12m: number;
  /**
   * Quanto do que ela pagou em 12 meses veio como JCP, em razão 0-1.
   *
   * Importa porque JCP leva 15% de imposto na fonte e dividendo não. Várias
   * empresas pagam 100% em JCP (B3SA3, VBBR3, ABCB4), e nesses casos o que cai
   * na conta é 15% menor que o dividend yield sugere. Nenhuma calculadora
   * genérica enxerga isso — a gente enxerga porque guarda o tipo de cada
   * pagamento em `dividend_payments`.
   */
  jcpShare: number;
}

interface PaymentTypeRow {
  ticker: string;
  type: string;
  value_per_share: number;
}

/** Ações que a calculadora de renda oferece. Mesmo critério da de FII. */
export async function fetchStockOptions(
  supabase: SupabaseClient
): Promise<StockOption[]> {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const [{ data: companyRows }, { data: fundamentalRows }, paymentRows] =
    await Promise.all([
      supabase
        .from('companies')
        .select('ticker,name,sector,logo_url,price')
        .eq('asset_type', 'stock')
        .gt('price', 0)
        .gte('last_seen_at', listedSince()),
      supabase
        .from('company_fundamentals')
        .select('ticker,dividends_12m')
        .gt('dividends_12m', 0),
      // Paginado: são ~3.500 pagamentos em 12 meses e o PostgREST devolvia as
      // 1.000 primeiras, cobrindo 158 dos ~500 tickers. Quem ficava de fora ia
      // pra tela com `jcpShare: 0` — ou seja, o valor BRUTO no lugar do
      // líquido, justo na calculadora cujo diferencial é descontar o IR do JCP.
      fetchAllRows<PaymentTypeRow>((from, to) =>
        supabase
          .from('dividend_payments')
          .select('ticker,type,value_per_share')
          .gte('ex_date', twelveMonthsAgo.toLocaleDateString('en-CA'))
          .range(from, to)
      ),
    ]);

  const dividends = new Map(
    ((fundamentalRows ?? []) as { ticker: string; dividends_12m: number }[]).map((row) => [
      row.ticker,
      Number(row.dividends_12m),
    ])
  );

  const totals = new Map<string, { all: number; jcp: number }>();
  for (const row of paymentRows) {
    const value = Number(row.value_per_share);
    if (!Number.isFinite(value)) continue;
    const current = totals.get(row.ticker) ?? { all: 0, jcp: 0 };
    current.all += value;
    if (row.type === 'JCP') current.jcp += value;
    totals.set(row.ticker, current);
  }

  return ((companyRows ?? []) as {
    ticker: string;
    name: string;
    sector: string | null;
    logo_url: string | null;
    price: number;
  }[])
    .flatMap((company) => {
      const dividends12m = dividends.get(company.ticker);
      const price = Number(company.price);
      if (!dividends12m || !price) return [];

      const paid = totals.get(company.ticker);
      return [
        {
          ticker: company.ticker,
          name: company.name,
          sector: company.sector,
          logoUrl: company.logo_url,
          price,
          dividends12m,
          jcpShare: paid && paid.all > 0 ? paid.jcp / paid.all : 0,
        },
      ];
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
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
  const [{ data: companyRows }, fundamentalRows] = await Promise.all([
    supabase
      .from('companies')
      .select('ticker,name,asset_type,price,volume')
      .in('asset_type', ['stock', 'fii'])
      .gte('last_seen_at', listedSince()),
    fetchAllRows<{ ticker: string; dividends_12m: number }>((from, to) =>
      supabase
        .from('company_fundamentals')
        .select('ticker,dividends_12m')
        .gt('dividends_12m', 0)
        .range(from, to)
    ),
  ]);

  const dividends = new Map(
    fundamentalRows.map((row) => [row.ticker, row.dividends_12m])
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

  type Row = Pick<CeilingOverrideRow, 'ticker' | 'payout' | 'manual_profit' | 'user_id'>;

  const global = new Map<string, Row>();
  const personal = new Map<string, Row>();
  for (const row of (data ?? []) as Row[]) {
    (row.user_id === null ? global : personal).set(row.ticker, row);
  }

  const overrides = new Map<string, AppliedOverride>();
  for (const ticker of new Set([...personal.keys(), ...global.keys()])) {
    const row = personal.get(ticker) ?? global.get(ticker)!;
    overrides.set(ticker, {
      ticker,
      payout: row.payout,
      manualProfit: row.manual_profit,
      isGlobal: row.user_id === null,
      hasGlobal: global.has(ticker),
    });
  }
  return overrides;
}
