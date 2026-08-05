import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncDividends, DEFAULT_DIVIDENDS_LIMIT } from '@/lib/market-sync';

/**
 * Proventos pagos, da bolsai, pra ações e FIIs: resumo de 12 meses e média dos
 * anos fechados em `company_fundamentals`, mais cada pagamento em
 * `dividend_payments` com data-com e data de depósito.
 *
 * Roda junto com o `/api/cron/market` num recorte menor; aqui é onde se cobre o
 * catálogo inteiro sem apertar o limite de 300s da função.
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
      : DEFAULT_DIVIDENDS_LIMIT;

  const result = await syncDividends(limit);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, dividends: result.data });
}
