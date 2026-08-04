import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { syncCatalog } from '@/lib/market-sync';

/**
 * Só o catálogo (ticker, nome, setor, logo, cotação de fechamento).
 * O cron agendado é o `/api/cron/market`; esta rota existe pra rodar a etapa
 * isolada quando algo parecer errado.
 */

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const result = await syncCatalog();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true, catalog: result.data });
}
