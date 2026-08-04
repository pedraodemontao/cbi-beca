import 'server-only';

/**
 * bolsai — fundamentos da B3 derivados das demonstrações da CVM.
 *
 * Complementa a brapi: ela entrega catálogo e cotação ao vivo, a bolsai entrega
 * quantidade de ações, lucro e patrimônio — que é o que o preço teto precisa e
 * o plano free da brapi não serve.
 *
 * `/fundamentals/{ticker}` não aceita lote: uma requisição por ticker.
 */

const BASE_URL = 'https://api.usebolsai.com/api/v1';

/**
 * A CVM publica as demonstrações em milhares de reais, enquanto preço e market
 * cap vêm em reais. Normalizamos tudo pra reais aqui, uma vez só, pra ninguém
 * errar de unidade lá na frente.
 */
const THOUSANDS = 1000;

const REVALIDATE_SECONDS = {
  /** O balanço só muda quando sai ITR/DFP novo — 6h é folgado. */
  fundamentals: 21600,
  /** FII anuncia rendimento uma vez por mês; 6h também sobra. */
  fiis: 21600,
} as const;

/** Por que a chamada não deu certo. O cron usa isso pra avisar em português. */
export type BolsaiFailure =
  | 'missing_key'
  | 'pro_required'
  | 'rate_limited'
  | 'not_found'
  | 'unauthorized'
  | 'unavailable';

export type BolsaiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: BolsaiFailure };

/** Campos crus do endpoint, nos nomes e unidades originais. */
interface BolsaiFundamentalsResponse {
  cvm_code?: string | number | null;
  ticker?: string | null;
  corporate_name?: string | null;
  reference_date?: string | null;
  close_price?: number | null;
  shares_outstanding?: number | null;
  /** Milhares de reais, TTM. */
  net_income?: number | null;
  /** Milhares de reais. */
  equity?: number | null;
  lpa?: number | null;
  vpa?: number | null;
  roe?: number | null;
  pl?: number | null;
  pvp?: number | null;
  net_margin?: number | null;
  net_debt_ebitda?: number | null;
}

/** Fundamentos já normalizados: valores monetários em reais. */
export interface CompanyFundamentals {
  ticker: string;
  cvmCode: string | null;
  corporateName: string | null;
  /** Data do balanço. Sempre exibir junto dos números — costuma defasar meses. */
  referenceDate: string | null;
  closePrice: number | null;
  sharesOutstanding: number | null;
  /** Lucro líquido TTM, em reais. */
  netIncome: number | null;
  /** Patrimônio líquido, em reais. */
  equity: number | null;
  lpa: number | null;
  vpa: number | null;
  roe: number | null;
  priceEarnings: number | null;
  priceToBook: number | null;
  netMargin: number | null;
  netDebtEbitda: number | null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toReais(thousands: unknown): number | null {
  const value = toNumber(thousands);
  return value === null ? null : value * THOUSANDS;
}

function failureFromStatus(status: number, body: string): BolsaiFailure {
  if (status === 403) {
    return body.includes('Pro tier') ? 'pro_required' : 'unauthorized';
  }
  if (status === 401) return 'unauthorized';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limited';
  return 'unavailable';
}

async function bolsaiFetch<T>(
  path: string,
  revalidate: number
): Promise<BolsaiResult<T>> {
  const key = process.env.BOLSAI_API_KEY;
  if (!key) {
    console.error('BOLSAI_API_KEY não configurada');
    return { ok: false, reason: 'missing_key' };
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'X-API-Key': key },
      next: { revalidate },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const reason = failureFromStatus(res.status, body);
      // 404 é rotina: nem todo ticker do catálogo tem registro na CVM.
      if (reason !== 'not_found') {
        console.error(`bolsai ${path} respondeu ${res.status} (${reason})`);
      }
      return { ok: false, reason };
    }

    return { ok: true, data: (await res.json()) as T };
  } catch (error) {
    console.error(`bolsai ${path} falhou`, error);
    return { ok: false, reason: 'unavailable' };
  }
}

/**
 * Fundamentos de FII, já normalizados.
 *
 * FII não tem LPA: o preço teto dele sai do rendimento distribuído nos últimos
 * 12 meses dividido pelo yield desejado — a mesma conta do Bazin.
 */
export interface FiiFundamentals {
  ticker: string;
  /** Razão 0-1. */
  dividendYield12m: number | null;
  /** R$ por cota distribuídos em 12 meses. */
  dividends12m: number | null;
  priceToBook: number | null;
  /** Valor patrimonial por cota. */
  bookValuePerShare: number | null;
  price: number | null;
  name: string | null;
}

/** A bolsai não documenta o nome exato dos campos de FII; aceitamos os apelidos. */
function pickNumber(source: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = toNumber(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function pickString(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/**
 * Yield vem ora como 8.5 (por cento), ora como 0.085 (razão). Acima de 1 só pode
 * ser percentual: FII com 100% de yield ao ano não existe.
 */
function toYieldRatio(value: number | null): number | null {
  if (value === null) return null;
  return value > 1 ? value / 100 : value;
}

function normalizeFii(raw: Record<string, unknown>, fallbackTicker: string): FiiFundamentals {
  const price = pickNumber(raw, ['close_price', 'price', 'last_price', 'quote']);
  const dividendYield12m = toYieldRatio(
    pickNumber(raw, ['dy', 'dividend_yield', 'dividend_yield_12m', 'dy_12m', 'yield_12m'])
  );
  const dividends12m = pickNumber(raw, [
    'dividends_12m',
    'distributions_12m',
    'total_distributions_12m',
    'rendimento_12m',
  ]);

  return {
    ticker: pickString(raw, ['ticker', 'symbol']) ?? fallbackTicker,
    dividendYield12m,
    // Sem a série de distribuições (que é Pro), o R$/cota sai do yield x preço.
    dividends12m:
      dividends12m ??
      (dividendYield12m !== null && price !== null ? dividendYield12m * price : null),
    priceToBook: pickNumber(raw, ['pvp', 'p_vp', 'price_to_book', 'pv']),
    bookValuePerShare: pickNumber(raw, [
      'vpa',
      'nav_per_share',
      'book_value_per_share',
      'equity_per_share',
    ]),
    price,
    name: pickString(raw, ['name', 'corporate_name', 'fund_name']),
  };
}

/** Todos os FIIs de uma vez: o endpoint aceita `limit` até 5.000. */
export async function getFiiList(limit = 500): Promise<BolsaiResult<FiiFundamentals[]>> {
  const result = await bolsaiFetch<unknown>(
    `/fiis/?limit=${limit}`,
    REVALIDATE_SECONDS.fiis
  );
  if (!result.ok) return result;

  const payload = result.data;
  const rows = Array.isArray(payload)
    ? payload
    : ((payload as { results?: unknown[]; data?: unknown[]; fiis?: unknown[] })?.results ??
      (payload as { data?: unknown[] })?.data ??
      (payload as { fiis?: unknown[] })?.fiis ??
      []);

  return {
    ok: true,
    data: (rows as Record<string, unknown>[])
      .filter((row) => row && typeof row === 'object')
      .map((row) => normalizeFii(row, '')),
  };
}

export async function getFii(ticker: string): Promise<BolsaiResult<FiiFundamentals>> {
  const result = await bolsaiFetch<Record<string, unknown>>(
    `/fiis/${encodeURIComponent(ticker)}`,
    REVALIDATE_SECONDS.fiis
  );
  if (!result.ok) return result;
  return { ok: true, data: normalizeFii(result.data, ticker) };
}

export async function getFundamentals(
  ticker: string
): Promise<BolsaiResult<CompanyFundamentals>> {
  const result = await bolsaiFetch<BolsaiFundamentalsResponse>(
    `/fundamentals/${encodeURIComponent(ticker)}`,
    REVALIDATE_SECONDS.fundamentals
  );
  if (!result.ok) return result;

  const raw = result.data;
  return {
    ok: true,
    data: {
      ticker: raw.ticker ?? ticker,
      cvmCode: raw.cvm_code == null ? null : String(raw.cvm_code),
      corporateName: raw.corporate_name ?? null,
      referenceDate: raw.reference_date ?? null,
      closePrice: toNumber(raw.close_price),
      sharesOutstanding: toNumber(raw.shares_outstanding),
      netIncome: toReais(raw.net_income),
      equity: toReais(raw.equity),
      lpa: toNumber(raw.lpa),
      vpa: toNumber(raw.vpa),
      roe: toNumber(raw.roe),
      priceEarnings: toNumber(raw.pl),
      priceToBook: toNumber(raw.pvp),
      netMargin: toNumber(raw.net_margin),
      netDebtEbitda: toNumber(raw.net_debt_ebitda),
    },
  };
}
