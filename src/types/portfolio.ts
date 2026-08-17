/**
 * O que a aluna consegue cadastrar na carteira.
 *
 * `bdr` entrou em 2026-08-17 e é o caminho de "investir no exterior" que não
 * custa fonte de dado nenhuma: recibo de ação estrangeira negociado na B3, em
 * reais, com cotação vinda da mesma brapi de sempre. `etf` entrou no mesmo
 * dia, e por necessidade: seis posições de alunas já existiam com ETF gravado
 * como 'fii'.
 *
 * Espelha o enum `public.asset_type` do banco (migrations 0014 e 0015).
 * Acrescentar valor aqui sem aplicar a migration faz o insert falhar no
 * Postgres.
 */
export type AssetType = 'stock' | 'fii' | 'bdr' | 'etf';

export interface PositionRow {
  id: string;
  user_id: string;
  ticker: string;
  asset_type: AssetType;
  quantity: number;
  avg_price: number;
  purchase_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Position {
  id: string;
  ticker: string;
  assetType: AssetType;
  quantity: number;
  avgPrice: number;
  purchaseDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileRow {
  id: string;
  display_name: string | null;
  created_at: string;
}

/** Valuation de uma posição individual. Campos null quando a cotação está indisponível. */
export interface PositionValuation {
  positionId: string;
  ticker: string;
  assetType: AssetType;
  quantity: number;
  avgPrice: number;
  investedValue: number;
  currentPrice: number | null;
  currentValue: number | null;
  profit: number | null;
  profitPercent: number | null;
}

export interface AssetTypeAllocation {
  assetType: AssetType;
  value: number;
  percentage: number;
}

/**
 * Agregado da carteira. Totais consideram apenas posições com cotação
 * disponível; `hasMissingQuotes` indica cobertura parcial.
 */
export interface PortfolioSummary {
  totalValue: number;
  investedValue: number;
  profit: number;
  profitPercent: number | null;
  allocation: AssetTypeAllocation[];
  positions: PositionValuation[];
  totalPositionsCount: number;
  pricedPositionsCount: number;
  hasMissingQuotes: boolean;
}

/**
 * Todas as compras de um mesmo ticker vistas como uma posição só —
 * é assim que a usuária pensa ("eu tenho PETR4"), não em lotes soltos.
 */
export interface TickerHolding {
  ticker: string;
  assetType: AssetType;
  quantity: number;
  /** Preço médio ponderado por quantidade entre todos os lotes. */
  avgPrice: number;
  investedValue: number;
  currentPrice: number | null;
  currentValue: number | null;
  profit: number | null;
  profitPercent: number | null;
  /** Lotes que compõem a posição, na ordem de cadastro. */
  lots: PositionValuation[];
}

export interface MonthlyIncome {
  /** YYYY-MM */
  month: string;
  amount: number;
}

export interface TickerIncome {
  ticker: string;
  total: number;
  payments: number;
}

/** Proventos já recebidos, calculados a partir do histórico da brapi. */
export interface DividendIncomeReport {
  /** Soma bruta dos proventos, antes do IR retido sobre a parte de JCP. */
  totalReceived: number;
  /** O que de fato foi creditado: bruto menos o IR retido na fonte. */
  netReceived: number;
  monthlyAverage: number;
  lastMonthReceived: number;
  monthly: MonthlyIncome[];
  byTicker: TickerIncome[];
  /** Renda mensal que a carteira atual geraria no ritmo dos últimos 12 meses. */
  estimatedMonthlyIncome: number;
  /** Alguma posição sem data de compra — o total pode estar subestimado. */
  hasMissingPurchaseDates: boolean;
  /**
   * BDRs na carteira, que ficam de fora da conta por FALTA DE DADO, não por
   * não pagarem.
   *
   * Nenhum dos 794 BDRs do catálogo tem provento gravado (medido em
   * 2026-08-17): a bolsai não cobre empresa estrangeira e o dividendo da brapi
   * só responde no sandbox. Na vida real o recibo repassa o que a empresa
   * distribuiu lá fora. Sem esta lista, quem cadastra AAPL34 lê "R$ 0,00
   * recebido" e conclui que a Apple não paga dividendo.
   */
  tickersWithoutDividendData: string[];
  /**
   * Quanto do total recebido veio como JCP. Importa porque JCP tem 15% de IR
   * retido na fonte e dividendo comum não tem — o que caiu na conta é menor
   * que o bruto, e nenhuma ferramenta popular mostra isso.
   */
  jcpReceived: number;
  /** IR retido sobre a parte de JCP. */
  taxWithheld: number;
}

export interface PortfolioSnapshot {
  captured_on: string;
  total_value: number;
  invested_value: number;
}

export interface UpcomingDividend {
  ticker: string;
  assetType: AssetType;
  label: string | null;
  rate: number | null;
  paymentDate: string;
}
