import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { buildPortfolioSummary } from '@/lib/portfolio';
import type { PositionRow } from '@/types/portfolio';

// Roda 1x/dia via Vercel Cron (ver vercel.json). Grava o patrimônio de cada
// usuário pra alimentar o gráfico de evolução — sem isso não há histórico,
// já que preço de mercado nunca é armazenado nas posições.

export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: rows, error } = await supabase
    .from('positions')
    .select('*')
    .order('user_id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Falha ao ler posições.' }, { status: 500 });
  }

  const positions = (rows ?? []) as PositionRow[];
  if (positions.length === 0) {
    return NextResponse.json({ ok: true, users: 0, snapshots: 0 });
  }

  const tickers = [...new Set(positions.map((position) => position.ticker))];
  const quotes = await getQuote(tickers);
  const quoteMap = new Map<string, BrapiQuote>(
    (quotes ?? []).map((quote) => [quote.symbol, quote])
  );

  const byUser = new Map<string, PositionRow[]>();
  for (const position of positions) {
    const list = byUser.get(position.user_id);
    if (list) list.push(position);
    else byUser.set(position.user_id, [position]);
  }

  const capturedOn = new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Sao_Paulo',
  });

  const snapshots = [...byUser.entries()]
    .map(([userId, userPositions]) => ({
      userId,
      summary: buildPortfolioSummary(userPositions, quoteMap),
    }))
    // Sem cotação nenhuma o snapshot seria zero e sujaria o gráfico
    .filter(({ summary }) => summary.pricedPositionsCount > 0)
    .map(({ userId, summary }) => ({
      user_id: userId,
      captured_on: capturedOn,
      total_value: Number(summary.totalValue.toFixed(2)),
      invested_value: Number(summary.investedValue.toFixed(2)),
    }));

  if (snapshots.length === 0) {
    return NextResponse.json({ ok: true, users: byUser.size, snapshots: 0 });
  }

  const { error: upsertError } = await supabase
    .from('portfolio_snapshots')
    .upsert(snapshots, { onConflict: 'user_id,captured_on' });

  if (upsertError) {
    return NextResponse.json({ error: 'Falha ao gravar snapshots.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    users: byUser.size,
    snapshots: snapshots.length,
  });
}
