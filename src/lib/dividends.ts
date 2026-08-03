import 'server-only';

import { getDividends } from '@/lib/brapi';
import type { AssetType, PositionRow, UpcomingDividend } from '@/types/portfolio';

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

/**
 * Busca os dividendos de cada ticker único da carteira e devolve os
 * pagamentos futuros (paymentDate >= hoje), ordenados por data.
 * Tolerante a falha individual: ticker que falhar é simplesmente ignorado.
 */
export async function getUpcomingDividends(
  positions: PositionRow[]
): Promise<UpcomingDividend[]> {
  const assetTypeByTicker = new Map<string, AssetType>();
  for (const position of positions) {
    if (!assetTypeByTicker.has(position.ticker)) {
      assetTypeByTicker.set(position.ticker, position.asset_type);
    }
  }
  if (assetTypeByTicker.size === 0) return [];

  const results = await Promise.all(
    [...assetTypeByTicker.entries()].map(async ([ticker, assetType]) => {
      try {
        const dividends = await getDividends(ticker, assetType);
        return { ticker, assetType, dividends: dividends ?? [] };
      } catch {
        return { ticker, assetType, dividends: [] };
      }
    })
  );

  const today = startOfToday();
  const upcoming: Array<UpcomingDividend & { paymentTime: number }> = [];

  for (const { ticker, assetType, dividends } of results) {
    for (const dividend of dividends) {
      if (!dividend.paymentDate) continue;
      const paymentTime = Date.parse(dividend.paymentDate);
      if (Number.isNaN(paymentTime) || paymentTime < today.getTime()) continue;
      upcoming.push({
        ticker,
        assetType,
        label: dividend.label ?? null,
        rate: typeof dividend.rate === 'number' ? dividend.rate : null,
        paymentDate: dividend.paymentDate,
        paymentTime,
      });
    }
  }

  upcoming.sort((a, b) => a.paymentTime - b.paymentTime);
  return upcoming.map((dividend) => ({
    ticker: dividend.ticker,
    assetType: dividend.assetType,
    label: dividend.label,
    rate: dividend.rate,
    paymentDate: dividend.paymentDate,
  }));
}
