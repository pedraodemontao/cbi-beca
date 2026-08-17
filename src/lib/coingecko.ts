import 'server-only';

import type { BrapiQuote } from '@/lib/brapi';

/**
 * Preço de criptomoeda em reais, pela API pública da CoinGecko.
 *
 * Por que não a brapi: ela devolve 403 e exige o plano Startup a R$ 119,99/mês
 * (medido em 2026-08-17). A CoinGecko serve BRL direto, sem chave, e aceita
 * LOTE — quinze moedas numa requisição só, que é o que faz a carteira inteira
 * caber numa chamada.
 *
 * O limite é apertado sem chave: medido, quatro requisições e a quinta leva
 * 429 com `retry-after: 60`. Sobrevive porque o padrão do projeto é `fetch`
 * com `revalidate` — uma chamada a cada dois minutos serve TODAS as usuárias,
 * não uma por pessoa. Uma chave demo gratuita sobe o teto para 30/min; quando
 * existir, entra em `COINGECKO_API_KEY` e o header abaixo passa a ir junto.
 */

const BASE_URL = 'https://api.coingecko.com/api/v3';

/** Mesmo carimbo da cotação de ação: preço de mercado não envelhece no banco. */
const REVALIDATE_SECONDS = 120;

/**
 * De símbolo para o id da CoinGecko.
 *
 * Lista CURADA, e isso é decisão de correção, não preguiça. O `/coins/list`
 * traz ~17 mil moedas e os símbolos COLIDEM: dezenas de tokens sem liquidez
 * reaproveitam siglas conhecidas, e casar por símbolo pegaria o primeiro que
 * aparecesse. Numa tela de patrimônio isso significa mostrar o preço de outra
 * coisa com o nome certo.
 *
 * Cobre o que se negocia de fato no Brasil. Moeda fora da lista é recusada no
 * cadastro com o motivo, em vez de virar uma linha sem preço.
 */
export const CRYPTO_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink',
  LTC: 'litecoin',
  MATIC: 'polygon-ecosystem-token',
  TRX: 'tron',
  SHIB: 'shiba-inu',
  UNI: 'uniswap',
  ATOM: 'cosmos',
  XLM: 'stellar',
  BCH: 'bitcoin-cash',
  NEAR: 'near',
  ARB: 'arbitrum',
  OP: 'optimism',
  AAVE: 'aave',
  SUI: 'sui',
  PEPE: 'pepe',
  TON: 'the-open-network',
  ICP: 'internet-computer',
  FIL: 'filecoin',
  ETC: 'ethereum-classic',
};

/** Nome legível, pra tela não mostrar só a sigla. */
export const CRYPTO_NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  USDT: 'Tether',
  USDC: 'USD Coin',
  BNB: 'BNB',
  SOL: 'Solana',
  XRP: 'XRP',
  ADA: 'Cardano',
  DOGE: 'Dogecoin',
  AVAX: 'Avalanche',
  DOT: 'Polkadot',
  LINK: 'Chainlink',
  LTC: 'Litecoin',
  MATIC: 'Polygon',
  TRX: 'TRON',
  SHIB: 'Shiba Inu',
  UNI: 'Uniswap',
  ATOM: 'Cosmos',
  XLM: 'Stellar',
  BCH: 'Bitcoin Cash',
  NEAR: 'NEAR Protocol',
  ARB: 'Arbitrum',
  OP: 'Optimism',
  AAVE: 'Aave',
  SUI: 'Sui',
  PEPE: 'Pepe',
  TON: 'Toncoin',
  ICP: 'Internet Computer',
  FIL: 'Filecoin',
  ETC: 'Ethereum Classic',
};

export function isKnownCrypto(symbol: string): boolean {
  return symbol.toUpperCase() in CRYPTO_IDS;
}

interface SimplePriceResponse {
  [id: string]: { brl?: number; brl_24h_change?: number };
}

/**
 * Cotações das moedas pedidas, no mesmo formato de `BrapiQuote`.
 *
 * Falar a língua do resto do app é de propósito: `/carteira` monta um
 * `Map<string, BrapiQuote>` e todo o cálculo de patrimônio depende dele. Uma
 * segunda forma obrigaria cada consumidor a saber de onde veio o preço.
 *
 * Símbolo desconhecido some do resultado, como já acontece na brapi — a
 * posição aparece com "cotação indisponível" em vez de derrubar as demais.
 */
export async function getCryptoQuotes(
  symbols: string[]
): Promise<BrapiQuote[] | null> {
  const known = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(
    isKnownCrypto
  );
  if (known.length === 0) return [];

  const ids = known.map((symbol) => CRYPTO_IDS[symbol]);
  const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(
    ids.join(',')
  )}&vs_currencies=brl&include_24hr_change=true`;

  const key = process.env.COINGECKO_API_KEY;

  try {
    const res = await fetch(url, {
      headers: key ? { 'x-cg-demo-api-key': key } : undefined,
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      // 429 é o caso esperado sem chave; vale distinguir no log porque a
      // correção é pegar a chave demo, não mexer no código.
      console.error(
        res.status === 429
          ? 'CoinGecko: limite de requisições atingido (429). Uma chave demo gratuita sobe o teto para 30/min.'
          : `CoinGecko respondeu ${res.status}`
      );
      return null;
    }

    const data = (await res.json()) as SimplePriceResponse;

    return known.flatMap((symbol) => {
      const entry = data[CRYPTO_IDS[symbol]];
      const price = entry?.brl;
      if (typeof price !== 'number' || !Number.isFinite(price)) return [];
      return [
        {
          symbol,
          shortName: CRYPTO_NAMES[symbol] ?? symbol,
          longName: CRYPTO_NAMES[symbol] ?? symbol,
          currency: 'BRL',
          regularMarketPrice: price,
          regularMarketChangePercent: entry.brl_24h_change,
        } satisfies BrapiQuote,
      ];
    });
  } catch (error) {
    console.error('CoinGecko falhou', error);
    return null;
  }
}
