import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncPriceHistory } from '@/lib/market-sync';

/**
 * Fechamentos de 30 dias pra sparkline. Custa uma requisição por ativo, então
 * cobre só os mais negociados — o resto da tabela vive bem sem o gráfico.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 200;

  const result = await syncPriceHistory(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, priceHistory: result.data });
}
