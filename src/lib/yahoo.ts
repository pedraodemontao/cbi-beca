import 'server-only';

import { toDayKey } from '@/lib/format';
import type { DailyClose } from '@/lib/market-radar';

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
  /**
   * Média ANUAL dos últimos 5 anos. É a base do Bazin clássico: ele desconfiava
   * de um ano bom isolado e trabalhava com o que a empresa sustenta ao longo do
   * tempo.
   */
  average5y: number;
  /** Quantos pagamentos entraram na soma de 12 meses — FII paga ~12, ação ~4. */
  payments: number;
  price: number | null;
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      /** Em SEGUNDOS, e alinhado posição a posição com `indicators.quote[0]`. */
      timestamp?: number[];
      events?: { dividends?: Record<string, { amount?: number; date?: number }> };
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
}

/** Períodos que o Yahoo aceita e que o app usa. */
export type DividendRange = '1y' | '5y' | '10y';

interface RawDividends {
  payments: DividendPayment[];
  price: number | null;
  closes: number[];
}

/**
 * O granular só importa pro gráfico de preço. Puxar 5 anos de dividendo com
 * fechamento diário traz 1.200 pontos que ninguém usa, então o intervalo mensal
 * é o padrão — os eventos de dividendo vêm completos do mesmo jeito.
 */
function intervalFor(range: DividendRange): string {
  return range === '1y' ? '1d' : '1mo';
}

/**
 * Histórico cru de pagamentos. O ticker vai com sufixo `.SA`, que é como o
 * Yahoo identifica a B3.
 */
async function fetchDividends(
  ticker: string,
  range: DividendRange,
  interval = intervalFor(range)
): Promise<RawDividends | null> {
  const symbol = `${ticker.toUpperCase()}.SA`;

  try {
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&events=div`,
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
      closes: (result.indicators?.quote?.[0]?.close ?? []).filter(
        (value): value is number => typeof value === 'number'
      ),
    };
  } catch (error) {
    console.error(`Yahoo ${symbol} falhou`, error);
    return null;
  }
}

/**
 * O que o ativo pagou por ação/cota: total dos últimos 12 meses e média anual
 * dos últimos 5 anos, numa requisição só.
 */
export async function getTrailingDividends(
  ticker: string
): Promise<TrailingDividends | null> {
  const raw = await fetchDividends(ticker, '5y');
  if (!raw) return null;

  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

  const recent = raw.payments.filter(
    (payment) => Date.parse(payment.date) >= oneYearAgo
  );
  const total5y = raw.payments.reduce((sum, payment) => sum + payment.rate, 0);

  return {
    ticker: ticker.toUpperCase(),
    total12m: recent.reduce((sum, payment) => sum + payment.rate, 0),
    average5y: total5y / 5,
    payments: recent.length,
    price: raw.price,
  };
}

/** Fechamentos dos últimos 30 dias, pra sparkline. */
export async function getPriceHistory(ticker: string): Promise<number[] | null> {
  const raw = await fetchDividends(ticker, '1y', '1d');
  if (!raw || raw.closes.length === 0) return null;
  // O range mínimo com granularidade diária é 1 ano; o gráfico quer o último mês.
  return raw.closes.slice(-30);
}

/**
 * Símbolo do Ibovespa no Yahoo.
 *
 * NÃO leva o sufixo `.SA` que as ações levam: o `^` já marca índice, e
 * `^BVSP.SA` devolve 404.
 */
const IBOV_SYMBOL = '^BVSP';

/** O índice fecha uma vez por dia — mesmo carimbo do histórico de preço. */
const INDEX_REVALIDATE_SECONDS = 3600;

/**
 * Fechamento diário do Ibovespa nos últimos 2 anos (~500 pregões, medido em
 * 2026-08-13).
 *
 * São DOIS anos porque o radar mede a posição do índice dentro de uma janela de
 * 252 pregões: com um ano de dado só o último pregão teria a janela cheia.
 *
 * O dia sai de `toDayKey`, no fuso de Brasília. O Yahoo carimba o pregão às
 * 13:00 UTC (abertura da B3), então converter em UTC daria o dia certo por
 * sorte — e deixaria de dar no primeiro horário de verão que aparecer.
 */
export async function getIbovHistory(): Promise<DailyClose[] | null> {
  try {
    const res = await fetch(
      `${BASE_URL}/${encodeURIComponent(IBOV_SYMBOL)}?interval=1d&range=2y`,
      { next: { revalidate: INDEX_REVALIDATE_SECONDS } }
    );

    if (!res.ok) {
      console.error(`Yahoo ${IBOV_SYMBOL} respondeu ${res.status}`);
      return null;
    }

    const data = (await res.json()) as YahooChartResponse;
    const result = data.chart?.result?.[0];
    const stamps = result?.timestamp;
    const closes = result?.indicators?.quote?.[0]?.close;
    if (!stamps || !closes) return null;

    // Chave por dia em vez de array: com o pregão em curso o Yahoo já devolve a
    // linha de hoje, e uma segunda leitura no mesmo dia repetiria a data. O
    // último valor do dia é o que vale.
    const byDay = new Map<string, number>();
    stamps.forEach((stamp, index) => {
      const close = closes[index];
      if (typeof close !== 'number' || !Number.isFinite(close)) return;
      byDay.set(toDayKey(stamp * 1000), close);
    });

    const history = [...byDay.entries()]
      .map(([day, close]) => ({ day, close }))
      .sort((a, b) => a.day.localeCompare(b.day));

    return history.length > 0 ? history : null;
  } catch (error) {
    console.error(`Yahoo ${IBOV_SYMBOL} falhou`, error);
    return null;
  }
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
