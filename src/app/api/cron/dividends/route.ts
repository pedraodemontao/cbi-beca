import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncDividends } from '@/lib/market-sync';

/**
 * Dividendos pagos nos últimos 12 meses (Yahoo), pra ações e FIIs.
 *
 * Roda junto com o `/api/cron/market`; existe em separado pra depurar e pra
 * repopular sem mexer no catálogo.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const requested = Number(new URL(request.url).searchParams.get('limit'));
  const limit = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 500;

  const result = await syncDividends(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, dividends: result.data });
}
