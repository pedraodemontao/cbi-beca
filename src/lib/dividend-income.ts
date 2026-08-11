import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getDividendHistory } from '@/lib/yahoo';
import { fetchDividendPayments } from '@/lib/dividends';
import type {
  DividendIncomeReport,
  MonthlyIncome,
  PositionRow,
  TickerIncome,
} from '@/types/portfolio';

/** Data e valor por cota — o mínimo que o cálculo de renda precisa. */
interface DividendPayment {
  date: string;
  rate: number;
  /** 'JCP' quando conhecido. Vindo do Yahoo o tipo não existe. */
  type?: string;
}

/** Imposto retido na fonte sobre juros sobre capital próprio. */
const JCP_TAX = 0.15;

// Quanto a carteira JÁ pingou: para cada pagamento anunciado depois da compra,
// valor recebido = taxa por cota × quantidade. Nada é digitado pela usuária.

/**
 * Mês de referência no formato YYYY-MM.
 *
 * Data-com vem do banco como coluna `date`, ou seja a string "2026-08-01" —
 * sem hora e sem fuso. `new Date` daquilo é meia-noite UTC, e converter para
 * São Paulo (UTC-3) voltava um dia: agosto virava julho. Não era caso de
 * borda: a bolsai usa a competência mensal como data-com dos fundos, então
 * mais de 70% dos pagamentos gravados caem no dia 1 e iam todos para o mês
 * anterior. O calendário de proventos já fatiava a string, o que deixava as
 * duas metades da mesma tela discordando entre si.
 *
 * Data pura é fatiada. Só o que vem do Yahoo tem hora de verdade (ISO
 * completo), e aí o fuso importa.
 */
function monthKey(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(0, 7);

  const parsed = new Date(date);
  return parsed
    .toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
    })
    .slice(0, 7);
}

function parsePaymentDate(dividend: DividendPayment): Date | null {
  const date = new Date(dividend.date);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Histórico de pagamentos dos tickers da carteira.
 *
 * Vem do banco, gravado pelo cron a partir da bolsai: é dado oficial e não custa
 * nenhuma chamada externa na renderização. O Yahoo entra só pra ticker que ainda
 * não passou pela sincronização — ativo recém-listado, por exemplo.
 *
 * A data usada é a data-com, não a do depósito: é ela que decide quem tem
 * direito ao pagamento, então é o critério certo pra "quanto já pingou desde a
 * compra".
 */
async function loadHistories(
  supabase: SupabaseClient,
  tickers: string[]
): Promise<Map<string, DividendPayment[]>> {
  const stored = await fetchDividendPayments(supabase, tickers);

  const histories = await Promise.all(
    tickers.map(async (ticker) => {
      const fromDatabase = stored.get(ticker);
      if (fromDatabase && fromDatabase.length > 0) {
        return [
          ticker,
          fromDatabase.map((payment) => ({
            date: payment.exDate,
            rate: payment.valuePerShare,
            type: payment.type,
          })),
        ] as const;
      }

      const fromYahoo = await getDividendHistory(ticker);
      return [ticker, fromYahoo ?? []] as const;
    })
  );

  return new Map(histories);
}

/**
 * Data em que a posição passou a render. Usa a compra informada; sem ela, cai
 * no cadastro — subestimar é mais honesto do que inflar o total recebido.
 */
function incomeStartDate(position: PositionRow): Date {
  return new Date(position.purchase_date ?? position.created_at);
}

export async function buildDividendIncomeReport(
  supabase: SupabaseClient,
  positions: PositionRow[]
): Promise<DividendIncomeReport> {
  const empty: DividendIncomeReport = {
    totalReceived: 0,
    netReceived: 0,
    monthlyAverage: 0,
    lastMonthReceived: 0,
    monthly: [],
    byTicker: [],
    estimatedMonthlyIncome: 0,
    hasMissingPurchaseDates: false,
    jcpReceived: 0,
    taxWithheld: 0,
  };

  if (positions.length === 0) return empty;

  const uniqueTickers = [...new Set(positions.map((position) => position.ticker))];
  const historyByTicker = await loadHistories(supabase, uniqueTickers);

  const now = new Date();
  const monthTotals = new Map<string, number>();
  const tickerTotals = new Map<string, { total: number; payments: Set<string> }>();
  let jcpReceived = 0;

  for (const position of positions) {
    const since = incomeStartDate(position);
    const dividends = historyByTicker.get(position.ticker) ?? [];

    for (const dividend of dividends) {
      const paidOn = parsePaymentDate(dividend);
      if (!paidOn || paidOn > now || paidOn < since) continue;
      if (typeof dividend.rate !== 'number') continue;

      const amount = dividend.rate * position.quantity;
      const key = monthKey(dividend.date);

      // JCP entra na conta separada porque leva 15% de IR na fonte. Pagamento
      // sem tipo (o que vem do Yahoo) conta como dividendo comum: supor imposto
      // onde não se sabe seria inventar desconto.
      if (dividend.type === 'JCP') jcpReceived += amount;

      monthTotals.set(key, (monthTotals.get(key) ?? 0) + amount);
      const current = tickerTotals.get(position.ticker) ?? {
        total: 0,
        payments: new Set<string>(),
      };
      current.total += amount;
      // Conta EVENTOS de pagamento, não linhas processadas: o laço externo é
      // por lote, então duas compras do mesmo ticker contavam cada provento
      // duas vezes. O valor em reais estava certo; só a contagem inflava.
      current.payments.add(`${dividend.date}|${dividend.rate}`);
      tickerTotals.set(position.ticker, current);
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
    monthly.find((entry) => entry.month === monthKey(previousMonth.toISOString()))
      ?.amount ?? 0;

  const byTicker: TickerIncome[] = [...tickerTotals.entries()]
    .map(([ticker, { total, payments }]) => ({ ticker, total, payments: payments.size }))
    .sort((a, b) => b.total - a.total);

  const taxWithheld = jcpReceived * JCP_TAX;

  return {
    totalReceived,
    // O que aparece em destaque na tela é este: o valor que a corretora
    // creditou. O bruto continua disponível pra explicar a diferença.
    netReceived: totalReceived - taxWithheld,
    monthlyAverage,
    lastMonthReceived,
    monthly,
    byTicker,
    // Últimos 12 meses projetados pro ritmo atual da carteira
    estimatedMonthlyIncome: estimateMonthlyIncome(positions, historyByTicker, now),
    hasMissingPurchaseDates: positions.some((position) => !position.purchase_date),
    jcpReceived,
    taxWithheld,
  };
}

/**
 * Renda mensal que a carteira ATUAL geraria: pega o que cada ativo pagou nos
 * últimos 12 meses por cota e aplica sobre a quantidade que ela tem hoje.
 */
function estimateMonthlyIncome(
  positions: PositionRow[],
  historyByTicker: Map<string, DividendPayment[]>,
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
