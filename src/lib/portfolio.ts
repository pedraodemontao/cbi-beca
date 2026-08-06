import type { BrapiQuote } from '@/lib/brapi';
import type {
  AssetType,
  AssetTypeAllocation,
  PortfolioSummary,
  PositionRow,
  PositionValuation,
  TickerHolding,
} from '@/types/portfolio';

// Funções puras (sem rede) — recebem posições + cotações e devolvem agregados.
// Tolerantes a cotação ausente: campos null na posição e totais calculados
// apenas sobre o que tem preço, com hasMissingQuotes sinalizando o gap.

export function buildPositionValuations(
  positions: PositionRow[],
  quoteMap: Map<string, BrapiQuote>
): PositionValuation[] {
  return positions.map((position) => {
    const investedValue = position.quantity * position.avg_price;
    const quote = quoteMap.get(position.ticker);
    const currentPrice =
      typeof quote?.regularMarketPrice === 'number' ? quote.regularMarketPrice : null;

    if (currentPrice === null) {
      return {
        positionId: position.id,
        ticker: position.ticker,
        assetType: position.asset_type,
        quantity: position.quantity,
        avgPrice: position.avg_price,
        investedValue,
        currentPrice: null,
        currentValue: null,
        profit: null,
        profitPercent: null,
      };
    }

    const currentValue = position.quantity * currentPrice;
    const profit = currentValue - investedValue;
    return {
      positionId: position.id,
      ticker: position.ticker,
      assetType: position.asset_type,
      quantity: position.quantity,
      avgPrice: position.avg_price,
      investedValue,
      currentPrice,
      currentValue,
      profit,
      profitPercent: investedValue > 0 ? (profit / investedValue) * 100 : null,
    };
  });
}

export function buildPortfolioSummary(
  positions: PositionRow[],
  quoteMap: Map<string, BrapiQuote>
): PortfolioSummary {
  const valuations = buildPositionValuations(positions, quoteMap);
  const priced = valuations.filter(
    (valuation): valuation is PositionValuation & { currentValue: number } =>
      valuation.currentValue !== null
  );

  const totalValue = priced.reduce((sum, valuation) => sum + valuation.currentValue, 0);
  const investedValue = priced.reduce((sum, valuation) => sum + valuation.investedValue, 0);
  const profit = totalValue - investedValue;
  const profitPercent = investedValue > 0 ? (profit / investedValue) * 100 : null;

  const valueByAssetType = new Map<AssetType, number>();
  for (const valuation of priced) {
    const current = valueByAssetType.get(valuation.assetType) ?? 0;
    valueByAssetType.set(valuation.assetType, current + valuation.currentValue);
  }
  const allocation: AssetTypeAllocation[] = [...valueByAssetType.entries()].map(
    ([assetType, value]) => ({
      assetType,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    })
  );

  return {
    totalValue,
    investedValue,
    profit,
    profitPercent,
    allocation,
    positions: valuations,
    totalPositionsCount: valuations.length,
    pricedPositionsCount: priced.length,
    hasMissingQuotes: priced.length < valuations.length,
  };
}

/**
 * Agrupa os lotes por ticker. Preço médio vira média ponderada pela
 * quantidade; totais só somam lotes com cotação disponível.
 */
export function groupByTicker(valuations: PositionValuation[]): TickerHolding[] {
  const byTicker = new Map<string, PositionValuation[]>();

  for (const valuation of valuations) {
    const lots = byTicker.get(valuation.ticker);
    if (lots) {
      lots.push(valuation);
    } else {
      byTicker.set(valuation.ticker, [valuation]);
    }
  }

  return [...byTicker.values()].map((lots) => {
    const quantity = lots.reduce((sum, lot) => sum + lot.quantity, 0);
    const investedValue = lots.reduce((sum, lot) => sum + lot.investedValue, 0);
    const currentPrice = lots.find((lot) => lot.currentPrice !== null)?.currentPrice ?? null;

    const currentValue = currentPrice === null ? null : currentPrice * quantity;
    const profit = currentValue === null ? null : currentValue - investedValue;

    return {
      ticker: lots[0].ticker,
      assetType: lots[0].assetType,
      quantity,
      avgPrice: quantity > 0 ? investedValue / quantity : 0,
      investedValue,
      currentPrice,
      currentValue,
      profit,
      profitPercent:
        profit === null || investedValue <= 0 ? null : (profit / investedValue) * 100,
      lots,
    };
  });
}

/** Uma fatia da carteira por setor. */
export interface SectorSlice {
  sector: string;
  value: number;
  /** Razão 0-1 sobre o patrimônio com cotação. */
  share: number;
  tickers: string[];
}

/**
 * Acima disso vale comentar. Não é regra de mercado nem limite de risco — é o
 * ponto em que a informação passa a ser útil pra quem está começando.
 */
export const CONCENTRATION_THRESHOLD = 0.4;

/**
 * Com menos ativos que isso, concentração é inevitável e apontar não ajuda:
 * quem tem duas ações SEMPRE vai estar concentrada, e ouvir isso no primeiro
 * mês desanima em vez de ensinar.
 */
const MIN_ASSETS_TO_COMMENT = 3;

export interface SectorConcentration {
  slices: SectorSlice[];
  /** A maior fatia, quando passa do limite E há ativos suficientes. */
  dominant: SectorSlice | null;
}

/**
 * Como a carteira se divide por setor.
 *
 * Só entra posição com cotação: somar quem não tem preço distorceria os
 * percentuais sem avisar.
 */
export function buildSectorConcentration(
  positions: PositionValuation[],
  sectorByTicker: Map<string, string | null>
): SectorConcentration {
  const priced = positions.filter((position) => position.currentValue !== null);
  const total = priced.reduce((sum, position) => sum + (position.currentValue ?? 0), 0);
  if (total <= 0) return { slices: [], dominant: null };

  const bySector = new Map<string, SectorSlice>();
  for (const position of priced) {
    const sector = sectorByTicker.get(position.ticker) || 'Outros';
    const slice = bySector.get(sector) ?? { sector, value: 0, share: 0, tickers: [] };
    slice.value += position.currentValue ?? 0;
    if (!slice.tickers.includes(position.ticker)) slice.tickers.push(position.ticker);
    bySector.set(sector, slice);
  }

  const slices = [...bySector.values()]
    .map((slice) => ({ ...slice, share: slice.value / total }))
    .sort((a, b) => b.value - a.value);

  const distinctAssets = new Set(priced.map((position) => position.ticker)).size;
  const biggest = slices[0];
  const dominant =
    distinctAssets >= MIN_ASSETS_TO_COMMENT &&
    biggest &&
    biggest.share > CONCENTRATION_THRESHOLD
      ? biggest
      : null;

  return { slices, dominant };
}
