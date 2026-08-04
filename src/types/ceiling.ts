/** Tipos do Preço Teto. `bdr` só existe no catálogo — não entra no ranking. */
export type MarketAssetType = 'stock' | 'fii' | 'bdr';

export interface CompanyRow {
  ticker: string;
  name: string;
  asset_type: MarketAssetType;
  sector: string | null;
  subsector: string | null;
  logo_url: string | null;
  price: number | null;
  change_percent: number | null;
  market_cap: number | null;
  price_updated_at: string | null;
  updated_at: string;
}

export interface CompanyFundamentalsRow {
  ticker: string;
  cvm_code: string | null;
  corporate_name: string | null;
  /** Data do balanço na CVM — sempre exibir junto dos números. */
  reference_date: string | null;
  shares_outstanding: number | null;
  /** Em reais (a conversão de milhares acontece na ingestão). */
  net_income: number | null;
  equity: number | null;
  lpa: number | null;
  vpa: number | null;
  roe: number | null;
  price_earnings: number | null;
  price_to_book: number | null;
  net_margin: number | null;
  net_debt_ebitda: number | null;
  dividends_12m: number | null;
  dividends_5y_avg: number | null;
  updated_at: string;
}

export interface CeilingOverrideRow {
  id: string;
  /** Nulo = override global da Beca, vale pra todo mundo. */
  user_id: string | null;
  ticker: string;
  payout: number | null;
  manual_profit: number | null;
  created_at: string;
  updated_at: string;
}
