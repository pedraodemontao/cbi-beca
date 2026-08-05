import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncFiis } from '@/lib/market-sync';

/**
 * Ficha dos FIIs (patrimônio por cota, P/VP, segmento), via `/fiis/screener`.
 *
 * Custa duas requisições pros 551 fundos, então roda junto com o
 * `/api/cron/market` sem pesar. O RENDIMENTO não vem daqui — o yield do screener
 * volta corrompido; quem traz é o `/api/cron/dividends`.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const result = await syncFiis();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, fiis: result.data });
}
