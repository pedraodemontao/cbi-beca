import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { getAccumulatedCdi, getCurrentCdiYearly } from '@/lib/bcb';
import { getUpcomingDividends } from '@/lib/dividends';
import {
  buildAllocation,
  buildPortfolioSummary,
  buildSectorConcentration,
} from '@/lib/portfolio';
import { fetchFixedIncome } from '@/lib/fixed-income-data';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import { formatBRL, formatPercent } from '@/lib/format';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { AllocationBar } from '@/components/resumo/allocation-bar';
import { DividendsCard } from '@/components/resumo/dividends-card';
import { EvolutionChart } from '@/components/resumo/evolution-chart';
import { CdiComparison } from '@/components/resumo/cdi-comparison';
import { IncomeGoalCard } from '@/components/resumo/income-goal-card';
import { SectorConcentration } from '@/components/resumo/sector-concentration';
import type { PortfolioSnapshot, PositionRow } from '@/types/portfolio';

export default async function ResumoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: positionRows }, { data: snapshotRows }, { data: profile }] =
    await Promise.all([
      supabase.from('positions').select('*').order('created_at', { ascending: true }),
      supabase
        .from('portfolio_snapshots')
        .select('captured_on,total_value,invested_value')
        .order('captured_on', { ascending: true })
        .limit(180),
      supabase.from('profiles').select('income_goal').eq('id', user.id).maybeSingle(),
    ]);

  const positions = (positionRows ?? []) as PositionRow[];
  const snapshots = (snapshotRows ?? []) as PortfolioSnapshot[];

  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const [quotes, upcomingDividends, incomeReport, { data: sectorRows }, fixedIncome] =
    await Promise.all([
      tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
      getUpcomingDividends(supabase, positions),
      buildDividendIncomeReport(supabase, positions),
      tickers.length > 0
        ? supabase.from('companies').select('ticker,sector').in('ticker', tickers)
        : Promise.resolve({ data: [] }),
      fetchFixedIncome(supabase),
    ]);
  const quoteMap = new Map<string, BrapiQuote>(
    (quotes ?? []).map((quote) => [quote.symbol, quote])
  );
  const summary = buildPortfolioSummary(positions, quoteMap);
  // A composição soma as duas fontes de patrimônio: sem isso a barra fecha em
  // 100% ignorando a renda fixa, e quem tem CDB vê uma carteira que não é a
  // dele.
  const allocation = buildAllocation(summary.allocation, fixedIncome.totalNet);
  const concentration = buildSectorConcentration(
    summary.positions,
    new Map(
      ((sectorRows ?? []) as { ticker: string; sector: string | null }[]).map((row) => [
        row.ticker,
        row.sector,
      ])
    )
  );
  const isUp = summary.profit >= 0;

  // CDI acumulado desde a compra mais antiga — a régua da renda fixa
  const since = earliestPurchase(positions);
  const [cdiPercent, cdiYearly] = await Promise.all([
    since ? getAccumulatedCdi(since) : Promise.resolve(null),
    getCurrentCdiYearly(),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Resumo
          </h1>
          <p className="micro-hint">
            Visão consolidada da carteira: patrimônio, composição e renda
            projetada.
          </p>
        </header>

        {/* Renda fixa sozinha também gera painel: cair no estado vazio
            esconderia patrimônio que existe. */}
        {positions.length === 0 && fixedIncome.holdings.length === 0 ? (
          <InfoNote>
            Nenhuma posição cadastrada. Registre seus ativos em{' '}
            <Link href="/carteira" className="font-bold underline">
              Carteira
            </Link>{' '}
            para gerar o painel.
          </InfoNote>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="card">
                <p className="micro-label">Patrimônio</p>
                <p className="num mt-1.5 text-2xl font-extrabold">
                  {formatBRL(summary.totalValue + fixedIncome.totalNet)}
                </p>
                <p className="micro-hint mt-1">
                  {fixedIncome.totalNet > 0
                    ? 'bolsa na cotação atual, mais renda fixa líquida'
                    : 'valor de mercado atual'}
                </p>
              </div>

              <div className="card">
                <p className="micro-label">Resultado</p>
                <p
                  className={`num mt-1.5 text-2xl font-extrabold ${
                    isUp ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {isUp ? '+' : ''}
                  {formatBRL(summary.profit)}
                </p>
                <p className="micro-hint mt-1">
                  {summary.profitPercent !== null
                    ? `${formatPercent(summary.profitPercent)} sobre o custo`
                    : 'sobre o custo de aquisição'}
                </p>
              </div>

              <div className="card">
                <p className="micro-label">Investido</p>
                <p className="num mt-1.5 text-2xl font-extrabold">
                  {formatBRL(summary.investedValue)}
                </p>
                <p className="micro-hint mt-1">custo de aquisição</p>
              </div>
            </section>

            <IncomeGoalCard
              goal={(profile?.income_goal as number | null) ?? null}
              monthlyIncome={incomeReport.estimatedMonthlyIncome}
              portfolioValue={summary.totalValue}
            />

            <SectorConcentration concentration={concentration} />

            <EvolutionChart snapshots={snapshots} />

            <CdiComparison
              portfolioPercent={summary.profitPercent}
              cdiPercent={cdiPercent}
              cdiYearly={cdiYearly}
              since={since}
            />

            <AllocationBar allocation={allocation} />

            <DividendsCard dividends={upcomingDividends} />

            <InfoNote title="Como ler estes números">
              Patrimônio é o valor de mercado das posições na cotação atual.
              Resultado é a diferença entre esse valor e o custo de aquisição —
              trata-se de ganho ou perda não realizado, que só se converte em
              caixa na venda.
            </InfoNote>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}

/** Data da compra mais antiga; cai no cadastro quando a data não foi informada. */
function earliestPurchase(positions: PositionRow[]): Date | null {
  const dates = positions
    .map((position) => position.purchase_date ?? position.created_at)
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((date) => date.getTime())));
}
