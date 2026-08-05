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
