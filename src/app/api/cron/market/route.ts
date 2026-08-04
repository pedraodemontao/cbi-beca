import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import {
  syncCatalog,
  syncFundamentals,
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

  const fundamentals = await syncFundamentals(limit);
  if (!fundamentals.ok) {
    // O catálogo já entrou; devolvemos o que deu certo junto com o que falhou.
    return NextResponse.json(
      { error: fundamentals.error, catalog: catalog.data },
      { status: fundamentals.status }
    );
  }

  return NextResponse.json({
    ok: true,
    catalog: catalog.data,
    fundamentals: fundamentals.data,
  });
}
