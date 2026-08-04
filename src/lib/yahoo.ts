import 'server-only';

/**
 * Dividendos pagos, via API pública de gráficos do Yahoo Finance.
 *
 * Existe porque as duas fontes pagas fecharam a porta: a bolsai cobra Pro em
 * `/dividends` e a brapi tirou dividendos do plano gratuito (só os quatro
 * tickers de sandbox respondem). O Yahoo entrega o histórico de pagamentos de
 * ação E de FII sem chave nenhuma.
 *
 * É fonte não-oficial e sem contrato: pode mudar de formato ou bloquear sem
 * aviso. Por isso nada aqui lança exceção — falhou, devolve `null`, e quem
 * chama segue com o que tem. O valor vai pro banco justamente pra tela nunca
 * depender dessa chamada em tempo real.
 */

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * NÃO mandar User-Agent de navegador aqui: fingir Chrome vindo de um fetch de
 * servidor faz o Yahoo devolver 429 em toda chamada (medido em 2026-08-04). Com
 * os headers padrão do runtime a mesma requisição volta 200.
 */

/** Dividendo anunciado hoje só muda o total daqui a semanas; 6h é folgado. */
const REVALIDATE_SECONDS = 21600;

export interface DividendPayment {
  /**
   * Data-com/ex-date em ISO. É a data que decide QUEM recebe: quem tinha o ativo
   * antes dela leva o dividendo, mesmo que o dinheiro caia semanas depois. Pra
   * saber o que a usuária tem direito a receber, é o critério certo.
   */
  date: string;
  /** R$ por ação/cota. */
  rate: number;
}

export interface TrailingDividends {
  ticker: string;
  /** Soma em R$ por ação/cota nos últimos 12 meses. */
  total12m: number;
  /** Quantos pagamentos entraram na soma — FII paga ~12, ação paga ~4. */
  payments: number;
  price: number | null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      events?: { dividends?: Record<string, { amount?: number; date?: number }> };
    }>;
    error?: unknown;
  };
}

/** Períodos que o Yahoo aceita e que o app usa. */
export type DividendRange = '1y' | '5y' | '10y';

interface RawDividends {
  payments: DividendPayment[];
  price: number | null;
}

/**
 * Histórico cru de pagamentos. O ticker vai com sufixo `.SA`, que é como o
 * Yahoo identifica a B3.
 */
async function fetchDividends(
  ticker: string,
  range: DividendRange
): Promise<RawDividends | null> {
  const symbol = `${ticker.toUpperCase()}.SA`;

  try {
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=${range}&events=div`,
      { next: { revalidate: REVALIDATE_SECONDS } }
    );

    if (!res.ok) {
      if (res.status !== 404) {
        console.error(`Yahoo ${symbol} respondeu ${res.status}`);
      }
      return null;
    }

    const data = (await res.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    if (!result) return null;

    const payments: DividendPayment[] = Object.values(result.events?.dividends ?? {})
      .filter(
        (entry): entry is { amount: number; date: number } =>
          typeof entry.amount === 'number' &&
          entry.amount > 0 &&
          typeof entry.date === 'number'
      )
      // O Yahoo devolve o timestamp em segundos.
      .map((entry) => ({
        date: new Date(entry.date * 1000).toISOString(),
        rate: entry.amount,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const price = result.meta?.regularMarketPrice;

    return {
      payments,
      price: typeof price === 'number' && price > 0 ? price : null,
    };
  } catch (error) {
    console.error(`Yahoo ${symbol} falhou`, error);
    return null;
  }
}

/** Soma o que o ativo pagou por ação/cota nos últimos 12 meses. */
export async function getTrailingDividends(
  ticker: string
): Promise<TrailingDividends | null> {
  const raw = await fetchDividends(ticker, '1y');
  if (!raw) return null;

  return {
    ticker: ticker.toUpperCase(),
    total12m: raw.payments.reduce((sum, payment) => sum + payment.rate, 0),
    payments: raw.payments.length,
    price: raw.price,
  };
}

/**
 * Todos os pagamentos do período, com data.
 *
 * É o que substitui a brapi no cálculo de "quanto já pingou": lá o histórico só
 * responde pros quatro tickers de sandbox do plano gratuito.
 */
export async function getDividendHistory(
  ticker: string,
  range: DividendRange = '5y'
): Promise<DividendPayment[] | null> {
  const raw = await fetchDividends(ticker, range);
  return raw?.payments ?? null;
}
