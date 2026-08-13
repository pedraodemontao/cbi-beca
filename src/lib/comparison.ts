/**
 * Comparador de ativos — dois a quatro tickers lado a lado.
 *
 * Não busca nada e não grava nada: recebe o que `ceiling-data.ts` leu do banco
 * e devolve a linha pronta. É o mesmo desenho de `ceiling-price.ts`, e é o que
 * permite a simulação recalcular no client quando a usuária muda o aporte.
 *
 * **Todo número aqui já existe no app** — teto, margem, rendimento, P/VP. O
 * comparador não inventa métrica nova; ele coloca as que já existem na mesma
 * régua, lado a lado, e é essa a razão de ele não ter campo pra digitar cotação
 * nem teto: o que a tela mostra tem que ser o mesmo que `/preco-teto` e
 * `/carteira` mostram do mesmo ticker, senão a plataforma se contradiz.
 */

import {
  DEFAULT_FII_YIELD,
  DEFAULT_PAYOUT,
  buildCeilingProjection,
  fiiCeiling,
  profitDeviation,
  safetyMargin,
} from '@/lib/ceiling-price';
import type {
  AppliedOverride,
  CeilingAsset,
  MarketAssetType,
} from '@/types/ceiling';

export const MIN_COMPARED = 2;
export const MAX_COMPARED = 4;

/**
 * IR retido na fonte sobre JCP. Dividendo comum e rendimento de FII são isentos.
 *
 * Repetido aqui de propósito: a outra definição mora em `dividend-income.ts`,
 * que é `server-only`, e a simulação roda no client.
 */
export const JCP_TAX = 0.15;

/** Acima disso o pagamento denuncia evento extraordinário — ver `isOutlier`. */
const OUTLIER_DIVIDEND_YIELD = 0.15;

/** Proxy de lucro atípico para quem não tem mediana histórica gravada. */
const OUTLIER_PRICE_EARNINGS = 6;

export interface ComparisonRow {
  ticker: string;
  name: string;
  assetType: MarketAssetType;
  /** O que o fundo é de verdade: 'FII', 'Fiagro', 'FI-Infra'. Nulo em ação. */
  fundType: string | null;
  sector: string | null;
  logoUrl: string | null;
  price: number | null;
  priceUpdatedAt: string | null;
  /** Data do balanço que gerou o teto. Nulo em fundo, que sai do rendimento. */
  referenceDate: string | null;
  ceiling: number | null;
  /** (teto − preço) ÷ TETO, em razão. A única conta de margem do app. */
  margin: number | null;
  /** Rendimento de 12 meses sobre a cotação, em razão, ANTES do imposto. */
  grossYield: number | null;
  /** O mesmo depois de descontar o IR da parte paga como JCP. */
  netYield: number | null;
  /** Quanto dos proventos de 12 meses veio como JCP, 0-1. Fundo vem 0. */
  jcpShare: number;
  /** Preço sobre valor patrimonial. Recalculado aqui, nunca copiado da fonte. */
  priceToBook: number | null;
  /** R$ por ação/cota distribuídos em 12 meses. */
  dividends12m: number | null;
  /** De quem é o ajuste que produziu esse teto, quando existe um. */
  overrideSource: 'curator' | 'personal' | null;
  /**
   * Provento ou lucro fora do padrão da própria empresa. A tela precisa dizer
   * isso: num comparador de quatro colunas, um fundo que amortizou capital
   * aparece com rendimento de 40% ao lado de um que paga 9% de verdade.
   */
  isOutlier: boolean;
}

interface BuildInput {
  asset: CeilingAsset;
  override?: AppliedOverride;
  /** Razão do que foi pago como JCP nos últimos 12 meses. */
  jcpShare?: number;
}

/**
 * Uma coluna do comparador.
 *
 * O teto sai do MESMO método que manda no resto do app: yield de 6% para ação
 * (é o que `headlineMargin` usa e por onde `/preco-teto` ordena) e o yield
 * padrão de fundo para FII. Escolher outro método aqui faria o comparador
 * discordar da tabela para o mesmo ticker.
 */
export function buildComparisonRow({
  asset,
  override,
  jcpShare = 0,
}: BuildInput): ComparisonRow {
  const isFii = asset.assetType === 'fii';

  const projection = buildCeilingProjection({
    price: asset.price,
    reportedProfit: asset.netIncome,
    // Ajuste da usuária vence o da Beca, e os dois vencem o padrão da casa.
    manualProfit: override?.manualProfit ?? null,
    sharesOutstanding: asset.sharesOutstanding,
    bookValuePerShare: asset.vpa,
    payout: override?.payout ?? DEFAULT_PAYOUT,
  });

  const ceiling = isFii
    ? fiiCeiling(asset.dividends12m, DEFAULT_FII_YIELD)
    : (projection.ceilings[0]?.ceiling ?? null);

  const margin = isFii ? safetyMargin(ceiling, asset.price) : projection.headlineMargin;

  const grossYield =
    asset.price !== null && asset.price > 0 && asset.dividends12m !== null
      ? asset.dividends12m / asset.price
      : null;

  // Fundo não paga JCP, então `jcpShare` chega 0 e o líquido é igual ao bruto.
  const netYield = grossYield === null ? null : grossYield * (1 - jcpShare * JCP_TAX);

  const priceToBook =
    asset.price !== null && asset.vpa !== null && asset.vpa > 0
      ? asset.price / asset.vpa
      : null;

  const priceEarnings =
    asset.price !== null && projection.eps !== null && projection.eps > 0
      ? asset.price / projection.eps
      : null;

  // Mediana histórica decide quando existe: comparar o lucro de agora com o que
  // a própria empresa costuma dar é mais honesto que o P/L. Sem ela, o proxy.
  const deviation = profitDeviation(
    projection.profitUsed,
    asset.netIncomeMedian,
    asset.netIncomeMedianQuarters
  );
  const hasAtypicalProfit =
    !isFii &&
    (asset.netIncomeMedian !== null
      ? deviation !== null
      : priceEarnings !== null && priceEarnings < OUTLIER_PRICE_EARNINGS);

  return {
    ticker: asset.ticker,
    name: asset.name,
    assetType: asset.assetType,
    fundType: asset.fundType,
    sector: asset.sector,
    logoUrl: asset.logoUrl,
    price: asset.price,
    priceUpdatedAt: asset.priceUpdatedAt,
    referenceDate: isFii ? null : asset.referenceDate,
    ceiling,
    margin,
    grossYield,
    netYield,
    jcpShare,
    priceToBook,
    dividends12m: asset.dividends12m,
    overrideSource: override ? (override.isGlobal ? 'curator' : 'personal') : null,
    isOutlier:
      (grossYield !== null && grossYield > OUTLIER_DIVIDEND_YIELD) || hasAtypicalProfit,
  };
}

export interface Simulation {
  /** Cotas inteiras que o aporte compra. Fracionário fica de fora. */
  shares: number;
  /** O que de fato entra no ativo — cotas × cotação, não o valor digitado. */
  invested: number;
  /** Troco que sobra parado, sem render nada. */
  leftover: number;
  /** Provento anual já líquido de IR. */
  yearlyIncome: number | null;
  monthlyIncome: number | null;
}

/**
 * Quanto o mesmo aporte renderia em cada ativo.
 *
 * **A conta divide pelo INVESTIDO, não pelo digitado.** Cota não se compra pela
 * metade: com cota de R$ 1.200 e aporte de R$ 5.000 sobram R$ 200 parados, e
 * usar os R$ 5.000 como base infla o rendimento de um ativo caro contra um
 * barato — justamente a comparação que esta tela existe pra fazer. É o mesmo
 * defeito que a calculadora de FII já teve.
 */
export function simulate(row: ComparisonRow, amount: number): Simulation {
  if (!Number.isFinite(amount) || amount <= 0 || row.price === null || row.price <= 0) {
    return { shares: 0, invested: 0, leftover: 0, yearlyIncome: null, monthlyIncome: null };
  }

  const shares = Math.floor(amount / row.price);
  const invested = shares * row.price;
  const yearlyIncome = row.netYield === null ? null : invested * row.netYield;

  return {
    shares,
    invested,
    leftover: amount - invested,
    yearlyIncome,
    monthlyIncome: yearlyIncome === null ? null : yearlyIncome / 12,
  };
}

/**
 * Índice do maior (ou menor) valor da linha, para a tabela marcar o extremo.
 *
 * Devolve `-1` quando o extremo é ambíguo: com duas colunas empatadas, apontar
 * uma delas seria escolha arbitrária apresentada como resultado. Linha com um
 * valor só também não tem extremo — comparar um número com nada não compara.
 */
export function extremeIndex(
  values: (number | null)[],
  direction: 'max' | 'min'
): number {
  const filled = values.filter((value): value is number => value !== null);
  if (filled.length < 2) return -1;

  const target = direction === 'max' ? Math.max(...filled) : Math.min(...filled);
  const matches = values.filter((value) => value === target).length;
  if (matches > 1) return -1;

  return values.findIndex((value) => value === target);
}
