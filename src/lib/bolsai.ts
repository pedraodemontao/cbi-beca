import 'server-only';

/**
 * bolsai — fundamentos da B3 derivados das demonstrações da CVM.
 *
 * Complementa a brapi: ela entrega catálogo e cotação ao vivo, a bolsai entrega
 * quantidade de ações, lucro e patrimônio — que é o que o preço teto precisa e
 * o plano free da brapi não serve.
 *
 * `/fundamentals/{ticker}` não aceita lote: uma requisição por ticker.
 *
 * Com a chave Pro (10.000 req/dia, medido em 2026-08-05 pelo header
 * `x-ratelimit-tier`) entram também `/dividends`, `/fiis/screener`,
 * `/fiis/{ticker}/distributions`, `/fundamentals/{ticker}/history` e
 * `/financials` — que é o que destrava dividendo pago de ação, preço teto de
 * FII e a comparação do lucro de hoje com o histórico.
 */

const BASE_URL = 'https://api.usebolsai.com/api/v1';

/**
 * A CVM publica as demonstrações em milhares de reais, enquanto preço e market
 * cap vêm em reais. Normalizamos tudo pra reais aqui, uma vez só, pra ninguém
 * errar de unidade lá na frente.
 */
const THOUSANDS = 1000;

/**
 * Lucro anual acima de cinco vezes o valor de mercado da empresa inteira não
 * existe — seria P/L de 0,2 num papel que ninguém quis comprar.
 */
const IMPLAUSIBLE_PROFIT_TO_MARKET_CAP = 5;

const REVALIDATE_SECONDS = {
  /** O balanço só muda quando sai ITR/DFP novo — 6h é folgado. */
  fundamentals: 21600,
  /** FII anuncia rendimento uma vez por mês; 6h também sobra. */
  fiis: 21600,
  /** Provento anunciado hoje só muda a série daqui a semanas. */
  dividends: 21600,
  /** Dez anos de balanço trimestral não mudam entre um ITR e outro. */
  history: 86400,
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
  /** Em reais. Serve de régua pra detectar a unidade do lucro. */
  market_cap?: number | null;
  shares_outstanding?: number | null;
  /** Milhares de reais, TTM — mas nem sempre; ver `profitScale`. */
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

/**
 * Em que unidade ESTE ticker veio.
 *
 * A convenção da CVM é milhares, mas a bolsai às vezes entrega o valor já em
 * reais — e aí calcula `lpa`, `vpa` e `pl` como se fosse milhares, corrompendo
 * os campos derivados dela junto. Medido em 2026-08-05 sobre o catálogo inteiro:
 * acontece em VIVA3 (LPA saía R$ 2.477,84 quando o certo é R$ 2,48), MTSA4,
 * RVEE3, HAGA3/4 e ESTR4 — cinco empresas em 380.
 *
 * O artefato é sempre um fator de mil, então basta escolher a leitura plausível.
 * Errar pro lado conservador (dividir por mil um lucro que era real) apaga a
 * empresa do ranking; errar pro outro lado inventaria um teto mil vezes maior.
 */
function profitScale(rawNetIncome: unknown, marketCap: unknown): number {
  const netIncome = toNumber(rawNetIncome);
  const cap = toNumber(marketCap);
  if (netIncome === null || cap === null || cap <= 0) return THOUSANDS;
  return Math.abs(netIncome * THOUSANDS) / cap > IMPLAUSIBLE_PROFIT_TO_MARKET_CAP
    ? 1
    : THOUSANDS;
}

/** Por ação, a partir do valor já normalizado. */
function perShare(total: number | null, shares: number | null): number | null {
  if (total === null || shares === null || shares <= 0) return null;
  return total / shares;
}

/** Múltiplo (P/L, P/VP). Denominador zero ou negativo não produz múltiplo útil. */
function ratio(price: number | null, perShareValue: number | null): number | null {
  if (price === null || perShareValue === null || perShareValue <= 0) return null;
  return price / perShareValue;
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
 * Ficha de um FII no screener.
 *
 * FII não tem LPA: o preço teto dele sai do rendimento distribuído nos últimos
 * 12 meses dividido pelo yield desejado — a mesma conta do Bazin. O rendimento
 * NÃO vem daqui, vem de `getFiiDistributions`: o `dividend_yield_ttm` do
 * screener volta corrompido (medido em 2026-08-05: RURA11 devolveu 3,4e15) e o
 * `dy_month_pct` tem outlier de 254% ao mês. Aqui ficam só os campos estáveis.
 */
export interface FiiScreenerRow {
  ticker: string;
  name: string | null;
  segment: string | null;
  fundType: string | null;
  /** Data da última informação mensal entregue à CVM. */
  referenceDate: string | null;
  price: number | null;
  /** Valor patrimonial por cota. */
  bookValuePerShare: number | null;
  priceToBook: number | null;
  sharesOutstanding: number | null;
  netAssetValue: number | null;
  totalShareholders: number | null;
  /** Razão 0-1. Só existe em fundo de tijolo. */
  vacancy: number | null;
}

interface BolsaiFiiScreenerResponse {
  data?: Record<string, unknown>[];
  count?: number;
  total?: number;
}

/** Percentual do payload (8.5) vira razão (0.085) — nunca o contrário. */
function percentToRatio(value: number | null): number | null {
  return value === null ? null : value / 100;
}

function normalizeScreenerRow(raw: Record<string, unknown>): FiiScreenerRow | null {
  const ticker = typeof raw.ticker === 'string' ? raw.ticker.toUpperCase() : null;
  if (!ticker) return null;

  return {
    ticker,
    name: typeof raw.name === 'string' ? raw.name : null,
    segment: typeof raw.segment === 'string' ? raw.segment : null,
    fundType: typeof raw.fund_type === 'string' ? raw.fund_type : null,
    referenceDate: typeof raw.reference_date === 'string' ? raw.reference_date : null,
    price: toNumber(raw.close_price),
    bookValuePerShare: toNumber(raw.book_value_per_share),
    priceToBook: toNumber(raw.pvp),
    sharesOutstanding: toNumber(raw.shares_outstanding),
    netAssetValue: toNumber(raw.net_asset_value),
    totalShareholders: toNumber(raw.total_shareholders),
    vacancy: percentToRatio(toNumber(raw.vacancy_pct)),
  };
}

/** O screener trava `limit` em 500 e são 551 fundos — daí a paginação. */
const SCREENER_PAGE = 500;

/** Todos os FIIs do screener, paginando até o fim. Custa 2 requisições. */
export async function getFiiScreener(): Promise<BolsaiResult<FiiScreenerRow[]>> {
  const rows: FiiScreenerRow[] = [];

  for (let offset = 0; ; offset += SCREENER_PAGE) {
    const result = await bolsaiFetch<BolsaiFiiScreenerResponse>(
      `/fiis/screener?limit=${SCREENER_PAGE}&offset=${offset}`,
      REVALIDATE_SECONDS.fiis
    );
    if (!result.ok) {
      // Primeira página falhou: não há o que devolver. Da segunda em diante,
      // meio catálogo vale mais que erro.
      if (rows.length === 0) return result;
      break;
    }

    const page = result.data.data ?? [];
    rows.push(...page.flatMap((row) => normalizeScreenerRow(row) ?? []));

    const total = result.data.total ?? rows.length;
    if (page.length === 0 || rows.length >= total) break;
  }

  return { ok: true, data: rows };
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
  const scale = profitScale(raw.net_income, raw.market_cap);
  const shares = toNumber(raw.shares_outstanding);
  const netIncome = toNumber(raw.net_income);
  const equity = toNumber(raw.equity);

  const netIncomeInReais = netIncome === null ? null : netIncome * scale;
  const equityInReais = equity === null ? null : equity * scale;

  return {
    ok: true,
    data: {
      ticker: raw.ticker ?? ticker,
      cvmCode: raw.cvm_code == null ? null : String(raw.cvm_code),
      corporateName: raw.corporate_name ?? null,
      referenceDate: raw.reference_date ?? null,
      closePrice: toNumber(raw.close_price),
      sharesOutstanding: shares,
      netIncome: netIncomeInReais,
      equity: equityInReais,
      // Derivados na mão em vez de copiados: os campos `lpa` e `vpa` da bolsai
      // saem da mesma leitura de unidade errada e vêm mil vezes maiores nos
      // tickers afetados. Só caímos no valor dela quando falta a quantidade de
      // ações pra fazer a conta.
      lpa: perShare(netIncomeInReais, shares) ?? toNumber(raw.lpa),
      vpa: perShare(equityInReais, shares) ?? toNumber(raw.vpa),
      roe: toNumber(raw.roe),
      // P/L e P/VP saem do mesmo lugar viciado; refazemos a partir do preço.
      priceEarnings: ratio(toNumber(raw.close_price), perShare(netIncomeInReais, shares))
        ?? toNumber(raw.pl),
      priceToBook: ratio(toNumber(raw.close_price), perShare(equityInReais, shares))
        ?? toNumber(raw.pvp),
      netMargin: toNumber(raw.net_margin),
      netDebtEbitda: toNumber(raw.net_debt_ebitda),
    },
  };
}

/** Um provento anunciado — JCP ou dividendo de ação, rendimento de FII. */
export interface DividendPayment {
  /**
   * Data-com: quem tinha o ativo antes dela recebe, mesmo que o dinheiro caia
   * semanas depois. É o critério certo pra "a que a usuária tem direito".
   * Em FII a bolsai só informa a competência mensal, que entra aqui.
   */
  exDate: string | null;
  /** Data do depósito. No futuro = provento anunciado e ainda a receber. */
  paymentDate: string | null;
  /** 'Dividendo' | 'JCP' | 'Rendimento'. Rótulo em português, direto da fonte. */
  type: string | null;
  valuePerShare: number;
}

export interface DividendHistory {
  ticker: string;
  name: string | null;
  /** R$ por ação/cota nos últimos 12 meses. */
  ttmPerShare: number | null;
  /** Razão 0-1 (a bolsai entrega em percentual). */
  dividendYieldTtm: number | null;
  price: number | null;
  /**
   * Média por ano dos ANOS FECHADOS — base do Bazin clássico, que desconfiava
   * de um ano bom isolado. O ano corrente fica de fora: está pela metade e
   * puxaria a média pra baixo sem motivo.
   */
  averagePerYear: number | null;
  /** Quantos anos entraram na média. A tela não pode dizer "5 anos" com 3. */
  averageYears: number;
  payments: DividendPayment[];
}

interface BolsaiAnnualSummary {
  year?: number;
  total_per_share?: number;
  payments?: number;
}

interface BolsaiDividendsResponse {
  ticker?: string;
  name?: string | null;
  dividend_yield_ttm?: number | null;
  ttm_per_share?: number | null;
  current_price?: number | null;
  close_price?: number | null;
  annual_summary?: BolsaiAnnualSummary[];
  payments?: Record<string, unknown>[];
}

/**
 * Teto de sanidade pro rendimento vindo da fonte.
 *
 * O `dividend_yield_ttm` da bolsai volta corrompido em alguns fundos — o
 * screener já devolvia 3,4e15 pra RURA11, e `/distributions` faz o mesmo em
 * parte dos Fiagro. Sem esse corte o número estoura o `numeric(12,6)` da coluna
 * e derruba a gravação do lote INTEIRO, levando junto os fundos que estavam
 * certos. Cinco (500% ao ano) é folgado: cabe até amortização de cota, que já é
 * evento extremo.
 */
const MAX_PLAUSIBLE_YIELD = 5;

/**
 * Mesma ideia pro R$/cota: `numeric(18,6)` não guarda valor astronômico.
 *
 * Vale também pra CADA pagamento gravado, não só pro agregado: um único valor
 * corrompido (a bolsai já devolveu 3,4e15) faz o banco recusar o insert. Desde
 * a migration 0020 a recusa fica contida no ticker (`replace_dividend_payments`
 * desfaz só ele e mantém o histórico antigo), mas o filtro continua valendo:
 * ticker recusado é ticker que fica com dado velho até alguém olhar o log.
 */
const MAX_PLAUSIBLE_PER_SHARE = 100_000;

function sane(value: number | null, limit: number): number | null {
  if (value === null) return null;
  return Math.abs(value) > limit ? null : value;
}

/** Janela do Bazin. */
const AVERAGE_WINDOW_YEARS = 5;

/** Abaixo disso não é média de nada — melhor não mostrar número. */
const MIN_YEARS_FOR_AVERAGE = 3;

/**
 * Média anual dos anos fechados.
 *
 * Ano sem pagamento some do `annual_summary`, então é preciso preencher o buraco
 * com zero: quem parou de pagar em 2023 não pode aparecer com a média de quem
 * nunca parou. Mas só até onde o histórico existe — empresa que abriu capital em
 * 2024 não carrega zeros de 2021.
 */
function averageOfClosedYears(
  summary: BolsaiAnnualSummary[],
  currentYear: number
): { average: number | null; years: number } {
  const byYear = new Map<number, number>();
  for (const entry of summary) {
    const year = toNumber(entry.year);
    const total = toNumber(entry.total_per_share);
    if (year === null || total === null) continue;
    byYear.set(year, Math.max(total, 0));
  }

  const firstYearWithData = Math.min(...byYear.keys());
  if (!Number.isFinite(firstYearWithData)) return { average: null, years: 0 };

  const years: number[] = [];
  for (let year = currentYear - 1; year >= currentYear - AVERAGE_WINDOW_YEARS; year -= 1) {
    if (year < firstYearWithData) break;
    years.push(byYear.get(year) ?? 0);
  }

  if (years.length < MIN_YEARS_FOR_AVERAGE) return { average: null, years: years.length };
  return {
    average: years.reduce((sum, value) => sum + value, 0) / years.length,
    years: years.length,
  };
}

function normalizePayment(raw: Record<string, unknown>): DividendPayment | null {
  const value = sane(toNumber(raw.value_per_share), MAX_PLAUSIBLE_PER_SHARE);
  if (value === null || value <= 0) return null;

  const asDate = (key: string): string | null =>
    typeof raw[key] === 'string' && raw[key] ? (raw[key] as string) : null;

  return {
    // Ação traz `ex_date`; FII traz só a competência em `reference_date`.
    exDate: asDate('ex_date') ?? asDate('reference_date'),
    paymentDate: asDate('payment_date'),
    type: typeof raw.type === 'string' ? raw.type : null,
    valuePerShare: value,
  };
}

function normalizeDividends(
  raw: BolsaiDividendsResponse,
  fallbackTicker: string
): DividendHistory {
  const { average, years } = averageOfClosedYears(
    raw.annual_summary ?? [],
    new Date().getFullYear()
  );

  return {
    ticker: (raw.ticker ?? fallbackTicker).toUpperCase(),
    name: raw.name ?? null,
    ttmPerShare: sane(toNumber(raw.ttm_per_share), MAX_PLAUSIBLE_PER_SHARE),
    dividendYieldTtm: sane(
      percentToRatio(toNumber(raw.dividend_yield_ttm)),
      MAX_PLAUSIBLE_YIELD
    ),
    price: toNumber(raw.current_price) ?? toNumber(raw.close_price),
    averagePerYear: sane(average, MAX_PLAUSIBLE_PER_SHARE),
    averageYears: years,
    payments: (raw.payments ?? [])
      .flatMap((payment) => normalizePayment(payment) ?? [])
      .sort((a, b) => (b.exDate ?? '').localeCompare(a.exDate ?? '')),
  };
}

/**
 * Proventos pagos por uma ação, com data-com, data de pagamento e tipo.
 *
 * Substitui o Yahoo como fonte primária: é dado oficial, separa JCP de dividendo
 * (que têm tributação diferente) e traz pagamento já anunciado com data futura —
 * que é o que o Yahoo não tem.
 */
export async function getStockDividends(
  ticker: string
): Promise<BolsaiResult<DividendHistory>> {
  const result = await bolsaiFetch<BolsaiDividendsResponse>(
    `/dividends/${encodeURIComponent(ticker)}`,
    REVALIDATE_SECONDS.dividends
  );
  if (!result.ok) return result;
  return { ok: true, data: normalizeDividends(result.data, ticker) };
}

/**
 * Rendimentos distribuídos por um FII, mês a mês.
 *
 * É daqui que sai o preço teto de FII: `ttmPerShare` dividido pelo yield
 * desejado. O screener não serve pra isso — o yield dele vem corrompido.
 */
export async function getFiiDistributions(
  ticker: string
): Promise<BolsaiResult<DividendHistory>> {
  const result = await bolsaiFetch<BolsaiDividendsResponse>(
    `/fiis/${encodeURIComponent(ticker)}/distributions`,
    REVALIDATE_SECONDS.dividends
  );
  if (!result.ok) return result;
  return { ok: true, data: normalizeDividends(result.data, ticker) };
}

/** Um trimestre da série histórica. Os valores são sempre TTM naquela data. */
export interface FundamentalsHistoryPoint {
  referenceDate: string;
  /** Lucro líquido TTM, em reais. */
  netIncome: number | null;
  lpa: number | null;
  roe: number | null;
}

interface BolsaiHistoryResponse {
  history?: Record<string, unknown>[];
}

/**
 * Até 10 anos de balanço trimestral.
 *
 * Serve pra uma coisa que o snapshot não resolve: saber se o lucro de agora é
 * normal ou ponto fora da curva. PETR4 oscilou de LPA 2,84 pra 10,13 em dois
 * trimestres — projetar dividendo em cima do pico é o erro que a flag de lucro
 * atípico existe pra evitar.
 */
export async function getFundamentalsHistory(
  ticker: string
): Promise<BolsaiResult<FundamentalsHistoryPoint[]>> {
  const result = await bolsaiFetch<BolsaiHistoryResponse>(
    `/fundamentals/${encodeURIComponent(ticker)}/history`,
    REVALIDATE_SECONDS.history
  );
  if (!result.ok) return result;

  return {
    ok: true,
    data: (result.data.history ?? []).flatMap((point) => {
      const referenceDate = point.reference_date;
      if (typeof referenceDate !== 'string') return [];

      // Mesma armadilha de unidade do snapshot, e aqui ela importa duas vezes:
      // a mediana histórica é comparada com o lucro de hoje, então as duas
      // pontas precisam estar na mesma escala.
      const scale = profitScale(point.net_income, point.market_cap);
      const netIncome = toNumber(point.net_income);

      return [
        {
          referenceDate,
          netIncome: netIncome === null ? null : netIncome * scale,
          lpa: perShare(
            netIncome === null ? null : netIncome * scale,
            toNumber(point.shares_outstanding)
          ) ?? toNumber(point.lpa),
          roe: toNumber(point.roe),
        },
      ];
    }),
  };
}
