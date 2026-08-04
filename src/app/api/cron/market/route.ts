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

/** Quanto cabe nos 300s junto com as outras etapas. */
const CRON_DIVIDENDS_LIMIT = 250;
const CRON_PRICE_HISTORY_LIMIT = 100;

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

  // Os FIIs vêm antes das ações porque custam UMA requisição pra lista inteira:
  // se a cota acabar no meio, o que cai é a cauda das ações, não a aba de FII.
  const fiis = await syncFiis();

  // Dividendo e histórico de preço vêm do Yahoo, que não divide cota com a
  // bolsai — rodam sempre, mesmo que os fundamentos falhem depois.
  //
  // Os limites existem por causa do teto de 300s da função: o Yahoo pede duas
  // conexões e pausa entre chamadas, então o catálogo inteiro leva uns 7
  // minutos. Aqui entram os mais relevantes; pra cobrir tudo de uma vez existem
  // `/api/cron/dividends` e `/api/cron/price-history`, sem limite apertado.
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
