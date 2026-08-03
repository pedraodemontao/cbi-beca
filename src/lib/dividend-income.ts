import 'server-only';
import { getDividends, type BrapiDividend } from '@/lib/brapi';
import type {
  DividendIncomeReport,
  MonthlyIncome,
  PositionRow,
  TickerIncome,
} from '@/types/portfolio';

// Quanto a carteira JÁ pingou: para cada pagamento anunciado depois da compra,
// valor recebido = taxa por cota × quantidade. Nada é digitado pela usuária.

/** Mês de referência no fuso de São Paulo, no formato YYYY-MM. */
function monthKey(date: Date): string {
  return date.toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).slice(0, 7);
}

function parsePaymentDate(dividend: BrapiDividend): Date | null {
  if (!dividend.paymentDate) return null;
  const date = new Date(dividend.paymentDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Data em que a posição passou a render. Usa a compra informada; sem ela, cai
 * no cadastro — subestimar é mais honesto do que inflar o total recebido.
 */
function incomeStartDate(position: PositionRow): Date {
  return new Date(position.purchase_date ?? position.created_at);
}

export async function buildDividendIncomeReport(
  positions: PositionRow[]
): Promise<DividendIncomeReport> {
  const empty: DividendIncomeReport = {
    totalReceived: 0,
    monthlyAverage: 0,
    lastMonthReceived: 0,
    monthly: [],
    byTicker: [],
    estimatedMonthlyIncome: 0,
    hasMissingPurchaseDates: false,
  };

  if (positions.length === 0) return empty;

  const uniqueTickers = [...new Set(positions.map((position) => position.ticker))];
  const assetTypeByTicker = new Map(
    positions.map((position) => [position.ticker, position.asset_type])
  );

  const histories = await Promise.all(
    uniqueTickers.map(async (ticker) => {
      const dividends = await getDividends(
        ticker,
        assetTypeByTicker.get(ticker) ?? 'stock'
      );
      return [ticker, dividends ?? []] as const;
    })
  );
  const historyByTicker = new Map(histories);

  const now = new Date();
  const monthTotals = new Map<string, number>();
  const tickerTotals = new Map<string, { total: number; payments: number }>();

  for (const position of positions) {
    const since = incomeStartDate(position);
    const dividends = historyByTicker.get(position.ticker) ?? [];

    for (const dividend of dividends) {
      const paidOn = parsePaymentDate(dividend);
      if (!paidOn || paidOn > now || paidOn < since) continue;
      if (typeof dividend.rate !== 'number') continue;

      const amount = dividend.rate * position.quantity;
      const key = monthKey(paidOn);

      monthTotals.set(key, (monthTotals.get(key) ?? 0) + amount);
      const current = tickerTotals.get(position.ticker) ?? { total: 0, payments: 0 };
      tickerTotals.set(position.ticker, {
        total: current.total + amount,
        payments: current.payments + 1,
      });
    }
  }

  const monthly: MonthlyIncome[] = [...monthTotals.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalReceived = monthly.reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyAverage = monthly.length > 0 ? totalReceived / monthly.length : 0;

  const previousMonth = new Date(now);
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const lastMonthReceived =
    monthly.find((entry) => entry.month === monthKey(previousMonth))?.amount ?? 0;

  const byTicker: TickerIncome[] = [...tickerTotals.entries()]
    .map(([ticker, { total, payments }]) => ({ ticker, total, payments }))
    .sort((a, b) => b.total - a.total);

  return {
    totalReceived,
    monthlyAverage,
    lastMonthReceived,
    monthly,
    byTicker,
    // Últimos 12 meses projetados pro ritmo atual da carteira
    estimatedMonthlyIncome: estimateMonthlyIncome(positions, historyByTicker, now),
    hasMissingPurchaseDates: positions.some((position) => !position.purchase_date),
  };
}

/**
 * Renda mensal que a carteira ATUAL geraria: pega o que cada ativo pagou nos
 * últimos 12 meses por cota e aplica sobre a quantidade que ela tem hoje.
 */
function estimateMonthlyIncome(
  positions: PositionRow[],
  historyByTicker: Map<string, BrapiDividend[]>,
  now: Date
): number {
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  let yearlyTotal = 0;
  for (const position of positions) {
    const dividends = historyByTicker.get(position.ticker) ?? [];
    for (const dividend of dividends) {
      const paidOn = parsePaymentDate(dividend);
      if (!paidOn || paidOn > now || paidOn < oneYearAgo) continue;
      if (typeof dividend.rate !== 'number') continue;
      yearlyTotal += dividend.rate * position.quantity;
    }
  }

  return yearlyTotal / 12;
}
