import 'server-only';

import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { getCryptoQuotes } from '@/lib/coingecko';
import type { PositionRow } from '@/types/portfolio';

/**
 * Cotação de um conjunto de posições, venha de onde vier.
 *
 * EXISTE POR CAUSA DE UMA COLISÃO REAL, e ela é do tipo silencioso: a brapi
 * responde `BTC` com **"Grayscale Bitcoin Mini Trust ETF" a R$ 28,43**
 * (medido em 2026-08-17). Não é "não encontrado" — é outro ativo, com a mesma
 * sigla, e a tela mostraria uma posição de Bitcoin valendo trinta reais sem
 * nenhum sinal de erro.
 *
 * Enquanto cada tela montava o próprio mapa, `/carteira` separava as fontes e
 * `/resumo`, `/api/chat` e o cron de snapshot não — a composição chegou a
 * exibir "Ações 99,27%" numa carteira que era 99% cripto. Centralizar aqui é
 * o que garante que a próxima tela nasça certa.
 *
 * Devolve tudo como `BrapiQuote` de propósito: o cálculo de patrimônio não
 * deve precisar saber de onde veio o preço.
 */
export async function getPositionQuotes(
  positions: Pick<PositionRow, 'ticker' | 'asset_type'>[]
): Promise<{ quoteMap: Map<string, BrapiQuote>; marketUnavailable: boolean }> {
  const marketTickers = [
    ...new Set(
      positions
        .filter((position) => position.asset_type !== 'crypto')
        .map((position) => position.ticker)
    ),
  ];
  const cryptoTickers = [
    ...new Set(
      positions
        .filter((position) => position.asset_type === 'crypto')
        .map((position) => position.ticker)
    ),
  ];

  const [market, crypto] = await Promise.all([
    marketTickers.length > 0
      ? getQuote(marketTickers)
      : Promise.resolve<BrapiQuote[]>([]),
    cryptoTickers.length > 0
      ? getCryptoQuotes(cryptoTickers)
      : Promise.resolve<BrapiQuote[]>([]),
  ]);

  const quoteMap = new Map<string, BrapiQuote>(
    [...(market ?? []), ...(crypto ?? [])].map((quote) => [quote.symbol, quote])
  );

  return {
    quoteMap,
    // Só a bolsa entra nesse aviso: é o que a tela já dizia antes de existir
    // cripto, e uma falha da CoinGecko não deve alegar que "as cotações de
    // mercado estão indisponíveis".
    marketUnavailable: marketTickers.length > 0 && market === null,
  };
}
