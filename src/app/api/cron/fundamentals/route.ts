import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncFundamentals, DEFAULT_FUNDAMENTALS_LIMIT } from '@/lib/market-sync';

/**
 * Só os fundamentos da CVM. Aceita `?limit=` pra caber na cota diária enquanto
 * a chave da bolsai estiver no plano free (200 requisições/dia).
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

  const result = await syncFundamentals(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, fundamentals: result.data });
}
