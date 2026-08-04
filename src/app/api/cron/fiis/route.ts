import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncFiis } from '@/lib/market-sync';

/**
 * Rendimento dos FIIs. Uma requisição à bolsai serve a lista inteira, então
 * roda junto com o `/api/cron/market` sem pesar na cota do plano free.
 *
 * `?debug=1` devolve o primeiro registro cru da bolsai — serve pra conferir o
 * nome dos campos, que a documentação não publica.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 500;

  const result = await syncFiis(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, fiis: result.data });
}
