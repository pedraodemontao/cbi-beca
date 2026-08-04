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

/**
 * Soma o que o ativo pagou por ação nos últimos 12 meses.
 *
 * O ticker vai com sufixo `.SA`, que é como o Yahoo identifica a B3.
 */
export async function getTrailingDividends(
  ticker: string
): Promise<TrailingDividends | null> {
  const symbol = `${ticker.toUpperCase()}.SA`;

  try {
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(symbol)}?interval=1d&range=1y&events=div`,
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

    const dividends = Object.values(result.events?.dividends ?? {});
    const amounts = dividends
      .map((entry) => entry.amount)
      .filter((amount): amount is number => typeof amount === 'number' && amount > 0);

    const price = result.meta?.regularMarketPrice;

    return {
      ticker: ticker.toUpperCase(),
      total12m: amounts.reduce((sum, amount) => sum + amount, 0),
      payments: amounts.length,
      price: typeof price === 'number' && price > 0 ? price : null,
    };
  } catch (error) {
    console.error(`Yahoo ${symbol} falhou`, error);
    return null;
  }
}
