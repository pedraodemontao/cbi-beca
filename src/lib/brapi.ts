import 'server-only';

const BASE_URL = 'https://brapi.dev/api/v2';

const REVALIDATE_SECONDS = {
  quote: 120,
  statistics: 3600,
  dividends: 21600,
  historical: 3600,
  tickers: 86400,
} as const;

export type AssetType = 'stock' | 'fii';

/**
 * Ranges liberados no plano free: 1d, 5d, 1mo, 3mo. Pedir 6mo+ devolve
 * INVALID_RANGE em qualquer ticker fora do sandbox (PETR4/MGLU3/VALE3/ITUB4).
 */
export type HistoricalRange = '1d' | '5d' | '1mo' | '3mo';

export interface BrapiQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  currency?: string;
  regularMarketPrice: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  regularMarketTime?: string;
  marketCap?: number;
  logourl?: string;
}

/**
 * Campos conferidos com token real: `priceEarnings` e `returnOnEquity` vêm
 * nulos na B3 — o P/L utilizável é `trailingPE`. Percentuais (`dividendYield`,
 * `profitMargins`, `52WeekChange`) chegam como fração: 0.06 = 6%.
 */
export interface BrapiStatistics {
  symbol?: string;
  trailingPE?: number | null;
  priceEarnings?: number | null;
  priceToBook?: number | null;
  dividendYield?: number | null;
  returnOnEquity?: number | null;
  beta?: number | null;
  earningsPerShare?: number | null;
  bookValue?: number | null;
  marketCap?: number | null;
  profitMargins?: number | null;
  '52WeekChange'?: number | null;
}

export interface BrapiDividend {
  assetIssued?: string;
  label?: string;
  rate?: number;
  paymentDate?: string;
  relatedTo?: string;
}

export interface BrapiHistoricalPrice {
  date: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BrapiTickerMatch {
  ticker?: string;
  symbol?: string;
  name?: string;
  longName?: string;
  /** 'stock' | 'fund' | 'bdr'… — usado pra pré-selecionar Ação/FII no form. */
  assetType?: string;
  /** 'fii' quando assetType é 'fund'. */
  subType?: string;
  type?: string;
}

type QueryParams = Record<string, string | undefined>;

async function brapiFetch<T>(
  path: string,
  params: QueryParams,
  revalidate: number
): Promise<T | null> {
  const token = process.env.BRAPI_TOKEN;
  if (!token) {
    console.error('BRAPI_TOKEN não configurado');
    return null;
  }
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  try {
    const res = await fetch(`${BASE_URL}${path}?${search}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate },
    });
    if (!res.ok) {
      console.error(`brapi ${path} respondeu ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (error) {
    console.error(`brapi ${path} falhou`, error);
    return null;
  }
}

// Envelope v2 (https://brapi.dev/docs): o payload principal fica em
// results[].data. Mantemos fallback pro shape achatado por tolerância.

interface BrapiResultEnvelope<T> {
  requestedSymbol?: string;
  symbol?: string;
  data?: T;
}

async function fetchSingleQuote(ticker: string): Promise<BrapiQuote | null> {
  const data = await brapiFetch<{
    results?: Array<BrapiResultEnvelope<Partial<BrapiQuote>> & Partial<BrapiQuote>>;
  }>('/stocks/quote', { symbols: ticker }, REVALIDATE_SECONDS.quote);

  const entry = data?.results?.[0];
  if (!entry) return null;

  const fields = entry.data ?? entry;
  const symbol = entry.symbol ?? entry.requestedSymbol ?? fields.symbol;
  if (!symbol || typeof fields.regularMarketPrice !== 'number') return null;

  return { ...fields, symbol, regularMarketPrice: fields.regularMarketPrice };
}

/**
 * Uma requisição por ticker: o plano free da brapi recusa lotes
 * (QUOTES_PER_REQUEST_EXCEEDED). Ticker que falha vira ausência no resultado,
 * não erro geral — a UI mostra "—" só naquela linha.
 */
export async function getQuote(tickers: string[]): Promise<BrapiQuote[] | null> {
  if (tickers.length === 0) return [];

  const quotes = await Promise.all(tickers.map(fetchSingleQuote));
  const found = quotes.filter((quote): quote is BrapiQuote => quote !== null);

  return found.length === 0 ? null : found;
}

export async function getStatistics(ticker: string): Promise<BrapiStatistics | null> {
  const data = await brapiFetch<{
    results?: Array<BrapiResultEnvelope<BrapiStatistics> & BrapiStatistics>;
  }>(
    '/stocks/statistics',
    { symbols: ticker, mode: 'current' },
    REVALIDATE_SECONDS.statistics
  );

  const entry = data?.results?.[0];
  if (!entry) return null;
  return entry.data ?? entry;
}

export async function getDividends(
  ticker: string,
  assetType: AssetType
): Promise<BrapiDividend[] | null> {
  const path = assetType === 'fii' ? '/fii/dividends' : '/stocks/dividends';
  const data = await brapiFetch<{
    results?: Array<
      BrapiResultEnvelope<{ cashDividends?: BrapiDividend[]; dividends?: BrapiDividend[] }> & {
        cashDividends?: BrapiDividend[];
        dividends?: BrapiDividend[];
      }
    >;
    dividends?: BrapiDividend[];
  }>(path, { symbols: ticker }, REVALIDATE_SECONDS.dividends);
  if (!data) return null;

  const entry = data.results?.[0];
  return (
    entry?.data?.cashDividends ??
    entry?.data?.dividends ??
    entry?.cashDividends ??
    entry?.dividends ??
    data.dividends ??
    null
  );
}

export async function getHistorical(
  ticker: string,
  range: HistoricalRange
): Promise<BrapiHistoricalPrice[] | null> {
  const data = await brapiFetch<{
    results?: Array<
      BrapiResultEnvelope<{ historicalDataPrice?: BrapiHistoricalPrice[] }> & {
        historicalDataPrice?: BrapiHistoricalPrice[];
      }
    >;
  }>(
    '/stocks/historical',
    { symbols: ticker, range, interval: '1d' },
    REVALIDATE_SECONDS.historical
  );
  const entry = data?.results?.[0];
  return entry?.data?.historicalDataPrice ?? entry?.historicalDataPrice ?? null;
}

export async function searchTickers(query: string): Promise<BrapiTickerMatch[] | null> {
  if (!query.trim()) return [];
  const data = await brapiFetch<{
    tickers?: BrapiTickerMatch[];
    results?: BrapiTickerMatch[];
  }>('/tickers', { search: query.trim() }, REVALIDATE_SECONDS.tickers);
  return data?.tickers ?? data?.results ?? null;
}
