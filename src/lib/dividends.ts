import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AssetType, PositionRow, UpcomingDividend } from '@/types/portfolio';

/**
 * Proventos lidos de `dividend_payments`, gravada pelo cron a partir da bolsai.
 *
 * Antes isso vinha da brapi em tempo de pageview, e o plano gratuito dela só
 * conhece quatro tickers de sandbox — quem não tinha PETR4, VALE3, ITUB4 ou
 * MGLU3 na carteira via "dado indisponível". Lendo do banco funciona pra
 * qualquer ativo do catálogo, sem nenhuma chamada externa na renderização.
 */

/** Um pagamento como o banco guarda. */
export interface StoredPayment {
  ticker: string;
  /** Data-com: quem tinha o ativo antes dela recebe. */
  exDate: string;
  paymentDate: string | null;
  type: string;
  valuePerShare: number;
}

interface PaymentRow {
  ticker: string;
  ex_date: string;
  payment_date: string | null;
  type: string;
  value_per_share: number;
}

/**
 * Até onde faz sentido chamar de "próximo".
 *
 * Existe empresa com calendário de dividendo declarado anos à frente (a CAML3
 * tem anúncio até 2028). Listar isso junto do que cai mês que vem não ajuda
 * ninguém a se organizar.
 */
const UPCOMING_HORIZON_MONTHS = 12;

/** O Postgres devolve numeric como string. */
function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toStoredPayment(row: PaymentRow): StoredPayment {
  return {
    ticker: row.ticker,
    exDate: row.ex_date,
    paymentDate: row.payment_date,
    type: row.type,
    valuePerShare: toNumber(row.value_per_share),
  };
}

/** `YYYY-MM-DD` no fuso de São Paulo — é o fuso do pregão. */
function toIsoDate(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

/** Todo o histórico gravado dos tickers pedidos, mais antigo primeiro. */
export async function fetchDividendPayments(
  supabase: SupabaseClient,
  tickers: string[]
): Promise<Map<string, StoredPayment[]>> {
  const byTicker = new Map<string, StoredPayment[]>();
  if (tickers.length === 0) return byTicker;

  const { data, error } = await supabase
    .from('dividend_payments')
    .select('ticker,ex_date,payment_date,type,value_per_share')
    .in('ticker', tickers)
    .order('ex_date', { ascending: true });

  if (error) {
    console.error('Falha ao ler proventos', error);
    return byTicker;
  }

  for (const row of (data ?? []) as PaymentRow[]) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(toStoredPayment(row));
    byTicker.set(row.ticker, list);
  }
  return byTicker;
}

/** Um provento anunciado, já convertido pro que ELA vai receber. */
export interface CalendarPayment {
  ticker: string;
  assetType: AssetType;
  /** Data-com: quem já tinha o ativo nela tem direito. */
  exDate: string;
  paymentDate: string;
  type: string;
  valuePerShare: number;
  /** Cotas com direito a esse pagamento. */
  quantity: number;
  amount: number;
}

export interface CalendarMonth {
  /** `YYYY-MM`. */
  month: string;
  total: number;
  payments: CalendarPayment[];
}

/**
 * O que ainda vai pingar, mês a mês.
 *
 * Diferente de `getUpcomingDividends`, que é uma lista corrida: aqui o
 * pagamento já vem multiplicado pela quantidade que ela tem, e agrupado por mês
 * de depósito. É a resposta pra "quanto eu recebo em setembro".
 *
 * A quantidade sai dos lotes comprados ATÉ a data-com. Provento cuja data-com
 * já passou só é dela se ela já tinha o ativo — comprar hoje não dá direito.
 */
export async function buildDividendCalendar(
  supabase: SupabaseClient,
  positions: PositionRow[]
): Promise<CalendarMonth[]> {
  if (positions.length === 0) return [];

  const assetTypeByTicker = new Map<string, AssetType>();
  for (const position of positions) {
    if (!assetTypeByTicker.has(position.ticker)) {
      assetTypeByTicker.set(position.ticker, position.asset_type);
    }
  }

  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + UPCOMING_HORIZON_MONTHS);

  const { data, error } = await supabase
    .from('dividend_payments')
    .select('ticker,ex_date,payment_date,type,value_per_share')
    .in('ticker', [...assetTypeByTicker.keys()])
    .gte('payment_date', toIsoDate(new Date()))
    .lte('payment_date', toIsoDate(horizon))
    .order('payment_date', { ascending: true });

  if (error) {
    console.error('Falha ao montar o calendário', error);
    return [];
  }

  const byMonth = new Map<string, CalendarMonth>();

  for (const row of (data ?? []) as PaymentRow[]) {
    if (!row.payment_date) continue;

    // Lote comprado depois da data-com não recebe. Sem data de compra, o
    // cadastro serve de referência — subestimar é mais honesto que inflar.
    const quantity = positions
      .filter(
        (position) =>
          position.ticker === row.ticker &&
          (position.purchase_date ?? position.created_at).slice(0, 10) <= row.ex_date
      )
      .reduce((sum, position) => sum + position.quantity, 0);
    if (quantity <= 0) continue;

    const valuePerShare = toNumber(row.value_per_share);
    const month = row.payment_date.slice(0, 7);
    const entry = byMonth.get(month) ?? { month, total: 0, payments: [] };
    const amount = valuePerShare * quantity;

    entry.total += amount;
    entry.payments.push({
      ticker: row.ticker,
      assetType: assetTypeByTicker.get(row.ticker) ?? 'stock',
      exDate: row.ex_date,
      paymentDate: row.payment_date,
      type: row.type,
      valuePerShare,
      quantity,
      amount,
    });
    byMonth.set(month, entry);
  }

  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * Proventos já anunciados que ainda vão cair, ordenados pela data do depósito.
 *
 * Só entra pagamento com data marcada: provento sem data não dá pra prometer.
 */
export async function getUpcomingDividends(
  supabase: SupabaseClient,
  positions: PositionRow[]
): Promise<UpcomingDividend[]> {
  const assetTypeByTicker = new Map<string, AssetType>();
  for (const position of positions) {
    if (!assetTypeByTicker.has(position.ticker)) {
      assetTypeByTicker.set(position.ticker, position.asset_type);
    }
  }
  if (assetTypeByTicker.size === 0) return [];

  const horizon = new Date();
  horizon.setMonth(horizon.getMonth() + UPCOMING_HORIZON_MONTHS);

  const { data, error } = await supabase
    .from('dividend_payments')
    .select('ticker,ex_date,payment_date,type,value_per_share')
    .in('ticker', [...assetTypeByTicker.keys()])
    .gte('payment_date', toIsoDate(new Date()))
    .lte('payment_date', toIsoDate(horizon))
    .order('payment_date', { ascending: true });

  if (error) {
    console.error('Falha ao ler próximos proventos', error);
    return [];
  }

  return ((data ?? []) as PaymentRow[]).flatMap((row) => {
    if (!row.payment_date) return [];
    return [
      {
        ticker: row.ticker,
        assetType: assetTypeByTicker.get(row.ticker) ?? 'stock',
        label: row.type,
        rate: toNumber(row.value_per_share),
        paymentDate: row.payment_date,
      },
    ];
  });
}
