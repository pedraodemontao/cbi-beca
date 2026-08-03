export type AssetType = 'stock' | 'fii';

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
  totalReceived: number;
  monthlyAverage: number;
  lastMonthReceived: number;
  monthly: MonthlyIncome[];
  byTicker: TickerIncome[];
  /** Renda mensal que a carteira atual geraria no ritmo dos últimos 12 meses. */
  estimatedMonthlyIncome: number;
  /** Alguma posição sem data de compra — o total pode estar subestimado. */
  hasMissingPurchaseDates: boolean;
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
