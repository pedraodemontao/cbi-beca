/**
 * Preço teto: até quanto pagar numa ação pra que o dividendo esperado entregue
 * o yield desejado.
 *
 * Tudo aqui é função pura, sem rede nem banco — é o que permite recalcular a
 * tabela inteira no client no instante em que a usuária mexe no payout ou
 * digita outro lucro.
 *
 * Empresa no prejuízo não tem preço teto: as funções devolvem `null` em vez de
 * número negativo, porque "teto de R$ -3,00" não significa nada pra ninguém.
 */

/** Bazin sugeria distribuir ~metade do lucro; o mercado costuma projetar 60%. */
export const DEFAULT_PAYOUT = 0.6;

/** Os três yields que as plataformas de referência exibem lado a lado. */
export const TARGET_YIELDS = [0.06, 0.08, 0.1] as const;

/** Yield clássico do método Bazin. */
export const BAZIN_YIELD = 0.06;

/** Múltiplo usado por Graham: P/L 15 × P/VP 1,5. */
const GRAHAM_MULTIPLIER = 22.5;

function isPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** As plataformas de referência exibem o teto no múltiplo de R$ 0,50 mais próximo. */
export function roundToHalf(value: number): number {
  return Math.round(value * 2) / 2;
}

/** Lucro por ação. Aceita lucro negativo — prejuízo é fato, não erro. */
export function earningsPerShare(
  profit: number | null,
  sharesOutstanding: number | null
): number | null {
  if (!isPositive(sharesOutstanding)) return null;
  if (typeof profit !== 'number' || !Number.isFinite(profit)) return null;
  return profit / sharesOutstanding;
}

/** Dividendo por ação projetado a partir do LPA e do payout. */
export function dividendPerShare(eps: number | null, payout: number): number | null {
  if (typeof eps !== 'number' || !Number.isFinite(eps)) return null;
  if (!isPositive(payout)) return null;
  return eps * payout;
}

/** Preço teto projetado: o DPA esperado dividido pelo yield que se quer receber. */
export function projectedCeiling(dps: number | null, targetYield: number): number | null {
  if (!isPositive(dps) || !isPositive(targetYield)) return null;
  return roundToHalf(dps / targetYield);
}

/** Bazin clássico: parte dos dividendos já pagos, não de projeção de lucro. */
export function bazinCeiling(
  dividendsPerShare12m: number | null,
  targetYield: number = BAZIN_YIELD
): number | null {
  if (!isPositive(dividendsPerShare12m) || !isPositive(targetYield)) return null;
  return roundToHalf(dividendsPerShare12m / targetYield);
}

/** Valor intrínseco de Graham: √(22,5 × LPA × VPA). */
export function grahamCeiling(
  eps: number | null,
  bookValuePerShare: number | null
): number | null {
  if (!isPositive(eps) || !isPositive(bookValuePerShare)) return null;
  return roundToHalf(Math.sqrt(GRAHAM_MULTIPLIER * eps * bookValuePerShare));
}

/**
 * Gordon: D₁ ÷ (k − g). Crescimento maior ou igual à taxa exigida faz o modelo
 * explodir pro infinito — nesse caso não há resposta, e devolvemos null.
 */
export function gordonCeiling(
  expectedDividend: number | null,
  requiredReturn: number,
  growth: number
): number | null {
  if (!isPositive(expectedDividend)) return null;
  const spread = requiredReturn - growth;
  if (!isPositive(spread)) return null;
  return roundToHalf(expectedDividend / spread);
}

/**
 * O dobro (ou a metade) do lucro normal já não descreve a empresa.
 *
 * Simétrico de propósito: lucro inflado infla o teto e convida a pagar caro,
 * lucro deprimido afunda o teto e faz parecer que não tem margem nenhuma. Os
 * dois enganam.
 */
const ATYPICAL_PROFIT_FACTOR = 2;

/** Menos de dois anos de balanço não formam mediana em que se possa confiar. */
const MIN_QUARTERS_FOR_MEDIAN = 8;

export type ProfitDeviation = 'high' | 'low' | null;

/**
 * O lucro de agora comparado com a mediana histórica da própria empresa.
 *
 * Substitui o P/L baixo como sinal de lucro atípico, e o dado de 2026-08-05
 * mostra por quê: PETR4 tem P/L 5,09 (que o critério antigo condenava) mas o
 * lucro TTM dela é 0,98× a mediana de cinco anos — é o normal da empresa. Já
 * TEND3 tem P/L 8,12, passava batido, e está com 9,5× o lucro de sempre.
 */
export function profitDeviation(
  profit: number | null,
  median: number | null,
  quarters: number | null
): ProfitDeviation {
  if (!isPositive(profit) || !isPositive(median)) return null;
  if ((quarters ?? 0) < MIN_QUARTERS_FOR_MEDIAN) return null;

  const ratio = profit / median;
  if (ratio > ATYPICAL_PROFIT_FACTOR) return 'high';
  if (ratio < 1 / ATYPICAL_PROFIT_FACTOR) return 'low';
  return null;
}

/** Quanto o preço teto está acima (positivo) ou abaixo (negativo) da cotação. */
export function ceilingMargin(ceiling: number | null, price: number | null): number | null {
  if (ceiling === null || !isPositive(price)) return null;
  return (ceiling - price) / price;
}

/** Dividend yield que o preço de hoje entregaria com o DPA projetado. */
export function projectedDividendYield(
  dps: number | null,
  price: number | null
): number | null {
  if (dps === null || !isPositive(price)) return null;
  return dps / price;
}

export interface CeilingInput {
  price: number | null;
  /** Lucro reportado no balanço (TTM), em reais. */
  reportedProfit: number | null;
  /** Lucro digitado por cima do reportado — vence quando presente. */
  manualProfit?: number | null;
  sharesOutstanding: number | null;
  /** VPA, usado só pelo Graham. */
  bookValuePerShare?: number | null;
  payout?: number;
}

export interface CeilingAtYield {
  targetYield: number;
  ceiling: number | null;
  margin: number | null;
}

export interface CeilingProjection {
  profitUsed: number | null;
  profitSource: 'manual' | 'reported' | 'none';
  payout: number;
  eps: number | null;
  dps: number | null;
  dividendYield: number | null;
  ceilings: CeilingAtYield[];
  graham: number | null;
  /** Margem no yield de 6% — é por ela que o ranking ordena. */
  headlineMargin: number | null;
}

/** Monta uma linha inteira da tabela de preço teto a partir dos dados crus. */
export function buildCeilingProjection(input: CeilingInput): CeilingProjection {
  const payout = isPositive(input.payout) ? input.payout : DEFAULT_PAYOUT;

  const hasManual =
    typeof input.manualProfit === 'number' && Number.isFinite(input.manualProfit);
  const profitUsed = hasManual ? input.manualProfit! : input.reportedProfit;
  const profitSource: CeilingProjection['profitSource'] = hasManual
    ? 'manual'
    : typeof input.reportedProfit === 'number'
      ? 'reported'
      : 'none';

  const eps = earningsPerShare(profitUsed, input.sharesOutstanding);
  const dps = dividendPerShare(eps, payout);

  const ceilings = TARGET_YIELDS.map((targetYield) => {
    const ceiling = projectedCeiling(dps, targetYield);
    return { targetYield, ceiling, margin: ceilingMargin(ceiling, input.price) };
  });

  return {
    profitUsed,
    profitSource,
    payout,
    eps,
    dps,
    dividendYield: projectedDividendYield(dps, input.price),
    ceilings,
    graham: grahamCeiling(eps, input.bookValuePerShare ?? null),
    headlineMargin: ceilings[0]?.margin ?? null,
  };
}
