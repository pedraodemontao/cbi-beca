import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import {
  syncCatalog,
  syncDividends,
  syncFiis,
  syncFundamentals,
  syncPriceHistory,
  DEFAULT_FUNDAMENTALS_LIMIT,
} from '@/lib/market-sync';

/**
 * Cron diário do preço teto: catálogo primeiro, fundamentos depois — a segunda
 * etapa lê os tickers que a primeira gravou.
 *
 * As duas etapas moram no mesmo cron porque o plano Hobby da Vercel só permite
 * dois por projeto, e o outro já é o snapshot de patrimônio.
 */

export const maxDuration = 300;

/**
 * Quanto cabe nos 300s junto com as outras etapas.
 *
 * O provento cobre o catálogo inteiro desde que a fonte virou a bolsai: 700
 * ativos levaram 22s, contra os ~7 minutos que o Yahoo pedia pelo mesmo volume.
 * O histórico de preço continua curto porque ele SIM ainda vem do Yahoo, que
 * exige duas conexões e pausa entre chamadas.
 */
const CRON_DIVIDENDS_LIMIT = 700;
const CRON_PRICE_HISTORY_LIMIT = 200;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get('limit'));
  const limit =
    Number.isFinite(requested) && requested > 0
      ? Math.floor(requested)
      : DEFAULT_FUNDAMENTALS_LIMIT;

  const catalog = await syncCatalog();
  if (!catalog.ok) {
    return NextResponse.json({ error: catalog.error }, { status: catalog.status });
  }

  // Os FIIs vêm antes das ações porque custam DUAS requisições pra lista
  // inteira: se algo estourar no meio, o que cai é a cauda das ações, não a aba
  // de FII.
  const fiis = await syncFiis();

  // Os limites existem por causa do teto de 300s da função, não mais por cota:
  // a chave Pro da bolsai dá 10.000 requisições por dia, mas o catálogo inteiro
  // não cabe em cinco minutos. Aqui entram os mais relevantes; pra cobrir tudo
  // existem `/api/cron/dividends` e `/api/cron/price-history`, sem aperto.
  const dividends = await syncDividends(CRON_DIVIDENDS_LIMIT);
  const priceHistory = await syncPriceHistory(CRON_PRICE_HISTORY_LIMIT);

  const fundamentals = await syncFundamentals(limit);
  if (!fundamentals.ok) {
    // O catálogo já entrou; devolvemos o que deu certo junto com o que falhou.
    return NextResponse.json(
      {
        error: fundamentals.error,
        catalog: catalog.data,
        fiis: fiis.ok ? fiis.data : { error: fiis.error },
        dividends: dividends.ok ? dividends.data : { error: dividends.error },
        priceHistory: priceHistory.ok
          ? priceHistory.data
          : { error: priceHistory.error },
      },
      { status: fundamentals.status }
    );
  }

  return NextResponse.json({
    ok: true,
    catalog: catalog.data,
    fiis: fiis.ok ? fiis.data : { error: fiis.error },
    dividends: dividends.ok ? dividends.data : { error: dividends.error },
    priceHistory: priceHistory.ok ? priceHistory.data : { error: priceHistory.error },
    fundamentals: fundamentals.data,
  });
}
