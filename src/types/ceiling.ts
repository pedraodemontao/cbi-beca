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
  /** Ações negociadas no dia. É o que separa empresa viva de papel parado. */
  volume: number | null;
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

/**
 * Linha crua da tabela de preço teto. Vai inteira pro client porque é lá que o
 * cálculo roda — mexer no payout precisa recalcular 400 linhas sem ida ao servidor.
 */
export interface CeilingAsset {
  ticker: string;
  name: string;
  sector: string | null;
  logoUrl: string | null;
  /** Cotação do catálogo (cache com carimbo), não preço ao vivo. */
  price: number | null;
  priceUpdatedAt: string | null;
  /** Ações negociadas no dia; vira volume financeiro junto com o preço. */
  volume: number | null;
  /** Lucro líquido TTM em reais. */
  netIncome: number | null;
  sharesOutstanding: number | null;
  vpa: number | null;
  referenceDate: string | null;
  /** 'fii' muda a conta inteira: sem LPA, o teto sai do rendimento de 12 meses. */
  assetType: MarketAssetType;
  /** R$ por cota distribuídos em 12 meses. Só FII tem, por enquanto. */
  dividends12m: number | null;
}

/** Override já resolvido: o da usuária vence o global da Beca. */
export interface AppliedOverride {
  ticker: string;
  /** Razão 0-2, como está no banco. */
  payout: number | null;
  manualProfit: number | null;
  /** Veio da Beca (user_id nulo) — a usuária vê, mas não edita nem apaga. */
  isGlobal: boolean;
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
