/** Tipos do Preço Teto. `bdr` só existe no catálogo — não entra no ranking. */
export type MarketAssetType = 'stock' | 'fii' | 'bdr';

export interface CompanyRow {
  ticker: string;
  name: string;
  asset_type: MarketAssetType;
  sector: string | null;
  subsector: string | null;
  /** Segmento do FII, da bolsai. É o que separa tijolo de papel. */
  segment: string | null;
  /** 'FII', 'Fiagro' ou 'FI-Infra'. `asset_type` agrupa os três. */
  fund_type: string | null;
  logo_url: string | null;
  price: number | null;
  change_percent: number | null;
  market_cap: number | null;
  /** Ações negociadas no dia. É o que separa empresa viva de papel parado. */
  volume: number | null;
  /** Fechamentos dos últimos 30 dias, pra sparkline. */
  price_history: number[] | null;
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
  /** Quantos anos fechados entraram na média — pode ser menos que 5. */
  dividends_years: number | null;
  dividend_yield_ttm: number | null;
  /** Mediana do lucro TTM histórico, em reais. Base da flag de lucro atípico. */
  net_income_median: number | null;
  net_income_median_quarters: number | null;
  dividends_source: string | null;
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
  /** Só FII tem: 'Logística', 'Papel', 'Lajes Corporativas'… */
  segment: string | null;
  /** O que o fundo é de verdade: 'FII', 'Fiagro' ou 'FI-Infra'. */
  fundType: string | null;
  logoUrl: string | null;
  /** Cotação do catálogo (cache com carimbo), não preço ao vivo. */
  price: number | null;
  priceUpdatedAt: string | null;
  /** Ações negociadas no dia; vira volume financeiro junto com o preço. */
  volume: number | null;
  /** Fechamentos dos últimos 30 dias; nulo para quem não entrou na cota do cron. */
  priceHistory: number[] | null;
  /** Lucro líquido TTM em reais. */
  netIncome: number | null;
  sharesOutstanding: number | null;
  vpa: number | null;
  referenceDate: string | null;
  /** 'fii' muda a conta inteira: sem LPA, o teto sai do rendimento de 12 meses. */
  assetType: MarketAssetType;
  /** R$ por ação/cota distribuídos nos últimos 12 meses. */
  dividends12m: number | null;
  /** Média anual dos últimos anos fechados — a base do Bazin clássico. */
  dividends5yAvg: number | null;
  /** Quantos anos entraram nessa média. A tela não pode dizer 5 quando são 3. */
  dividendsYears: number | null;
  /**
   * Mediana do lucro TTM ao longo dos trimestres, em reais. Quando o lucro de
   * hoje descola muito dela, a linha ganha selo de lucro atípico.
   */
  netIncomeMedian: number | null;
  /** Quantos trimestres formaram a mediana — poucos não sustentam o selo. */
  netIncomeMedianQuarters: number | null;
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
