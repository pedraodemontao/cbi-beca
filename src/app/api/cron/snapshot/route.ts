import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/cron-auth';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { accrueBetween, getCdiSeries } from '@/lib/bcb';
import { buildPortfolioSummary } from '@/lib/portfolio';
import { valuate } from '@/lib/fixed-income';
import type { PositionRow } from '@/types/portfolio';
import type { FixedIncomeRow } from '@/types/fixed-income';

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

  // Renda fixa entra no snapshot porque entra no patrimônio. Sem isso o
  // gráfico de evolução conta só a bolsa, e quem tem CDB vê uma linha que
  // subestima o que ele tem — em silêncio, e crescendo com o tempo.
  const { data: fixedRows } = await supabase
    .from('fixed_income_positions')
    .select('*');
  const fixedIncome = (fixedRows ?? []) as FixedIncomeRow[];

  if (positions.length === 0 && fixedIncome.length === 0) {
    return NextResponse.json({ ok: true, users: 0, snapshots: 0 });
  }

  const fixedByUser = await valuateFixedByUser(fixedIncome);

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

  // Usuária que só tem renda fixa não aparece em `byUser` — o mapa vem das
  // posições de bolsa. Entra aqui pra não sumir do gráfico.
  for (const userId of fixedByUser.keys()) {
    if (!byUser.has(userId)) byUser.set(userId, []);
  }

  const snapshots = [...byUser.entries()]
    .map(([userId, userPositions]) => ({
      userId,
      summary: buildPortfolioSummary(userPositions, quoteMap),
      fixed: fixedByUser.get(userId) ?? { net: 0, principal: 0 },
    }))
    // Sem cotação nenhuma E sem renda fixa o snapshot seria zero e sujaria o
    // gráfico. Com renda fixa, o valor existe mesmo que a bolsa não responda.
    .filter(
      ({ summary, fixed }) => summary.pricedPositionsCount > 0 || fixed.net > 0
    )
    .map(({ userId, summary, fixed }) => ({
      user_id: userId,
      captured_on: capturedOn,
      total_value: Number((summary.totalValue + fixed.net).toFixed(2)),
      invested_value: Number(
        (summary.investedValue + fixed.principal).toFixed(2)
      ),
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

/**
 * Renda fixa de todas as usuárias, avaliada com UMA leitura do Banco Central.
 *
 * Uma chamada por posição seria ~100 requisições ao SGS numa rodada só. Aqui a
 * série vem inteira, do aporte mais antigo até hoje, e cada período é fatiado
 * em memória.
 */
async function valuateFixedByUser(
  rows: FixedIncomeRow[]
): Promise<Map<string, { net: number; principal: number }>> {
  const byUser = new Map<string, { net: number; principal: number }>();
  if (rows.length === 0) return byUser;

  const now = new Date();
  const today = now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const earliest = rows.reduce(
    (min, row) => (row.applied_on < min ? row.applied_on : min),
    rows[0].applied_on
  );

  const [y, m, d] = earliest.split('-').map(Number);
  const series = await getCdiSeries(new Date(y, m - 1, d), now);

  for (const row of rows) {
    const bucket = byUser.get(row.user_id) ?? { net: 0, principal: 0 };
    const principal = Number(row.principal);
    bucket.principal += principal;

    // Papel vencido para de render: o intervalo fecha no vencimento.
    const until =
      row.matures_on && row.matures_on < today ? row.matures_on : today;
    const accrual = series
      ? accrueBetween(
          series,
          row.applied_on,
          until,
          row.index_kind === 'cdi' ? Number(row.index_percent ?? 100) : 0
        )
      : null;

    const [ay, am, ad] = row.applied_on.split('-').map(Number);
    const maturity = row.matures_on
      ? (([my, mm, md]) => new Date(my, mm - 1, md))(
          row.matures_on.split('-').map(Number)
        )
      : null;

    const valuation = valuate({
      principal,
      kind: row.kind,
      indexKind: row.index_kind,
      indexPercent: row.index_percent === null ? null : Number(row.index_percent),
      ratePercent: row.rate_percent === null ? null : Number(row.rate_percent),
      cdiFactor: accrual?.factor ?? null,
      businessDays: accrual?.businessDays ?? null,
      appliedOn: new Date(ay, am - 1, ad),
      maturesOn: maturity,
      now,
    });

    // Sem cálculo entra pelo principal: é o piso conhecido, e somar zero
    // faria o patrimônio despencar no gráfico por causa de uma falha de rede.
    bucket.net += valuation?.netValue ?? principal;
    byUser.set(row.user_id, bucket);
  }

  return byUser;
}
