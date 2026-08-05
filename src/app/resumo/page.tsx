import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { getAccumulatedCdi, getCurrentCdiYearly } from '@/lib/bcb';
import { getUpcomingDividends } from '@/lib/dividends';
import { buildPortfolioSummary } from '@/lib/portfolio';
import { formatBRL, formatPercent } from '@/lib/format';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BecaTip } from '@/components/shared/beca-tip';
import { AllocationBar } from '@/components/resumo/allocation-bar';
import { DividendsCard } from '@/components/resumo/dividends-card';
import { EvolutionChart } from '@/components/resumo/evolution-chart';
import { CdiComparison } from '@/components/resumo/cdi-comparison';
import type { PortfolioSnapshot, PositionRow } from '@/types/portfolio';

export default async function ResumoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [{ data: positionRows }, { data: snapshotRows }] = await Promise.all([
    supabase.from('positions').select('*').order('created_at', { ascending: true }),
    supabase
      .from('portfolio_snapshots')
      .select('captured_on,total_value,invested_value')
      .order('captured_on', { ascending: true })
      .limit(180),
  ]);

  const positions = (positionRows ?? []) as PositionRow[];
  const snapshots = (snapshotRows ?? []) as PortfolioSnapshot[];

  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const [quotes, upcomingDividends] = await Promise.all([
    tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
    getUpcomingDividends(supabase, positions),
  ]);
  const quoteMap = new Map<string, BrapiQuote>(
    (quotes ?? []).map((quote) => [quote.symbol, quote])
  );
  const summary = buildPortfolioSummary(positions, quoteMap);
  const isUp = summary.profit >= 0;

  // CDI acumulado desde a compra mais antiga — a régua da renda fixa
  const since = earliestPurchase(positions);
  const [cdiPercent, cdiYearly] = await Promise.all([
    since ? getAccumulatedCdi(since) : Promise.resolve(null),
    getCurrentCdiYearly(),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Teu resumo
          </h1>
          <p className="micro-hint">
            A visão geral do teu dinheiro, sem planilha e sem economês.
          </p>
        </header>

        {positions.length === 0 ? (
          <BecaTip>
            Ainda não tem nada pra resumir. Cadastra teu primeiro ativo na{' '}
            <Link href="/carteira" className="font-bold underline">
              Minha Carteira
            </Link>{' '}
            que eu monto esse painel pra você.
          </BecaTip>
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="card">
                <p className="micro-label">Patrimônio</p>
                <p className="num mt-1.5 text-2xl font-extrabold">
                  {formatBRL(summary.totalValue)}
                </p>
                <p className="micro-hint mt-1">vale hoje, tudo somado</p>
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
                    ? `${formatPercent(summary.profitPercent)} desde que você começou`
                    : 'desde que você começou'}
                </p>
              </div>

              <div className="card">
                <p className="micro-label">Investido</p>
                <p className="num mt-1.5 text-2xl font-extrabold">
                  {formatBRL(summary.investedValue)}
                </p>
                <p className="micro-hint mt-1">saiu do teu bolso</p>
              </div>
            </section>

            <EvolutionChart snapshots={snapshots} />

            <CdiComparison
              portfolioPercent={summary.profitPercent}
              cdiPercent={cdiPercent}
              cdiYearly={cdiYearly}
              since={since}
            />

            <AllocationBar allocation={summary.allocation} />

            <DividendsCard dividends={upcomingDividends} />

            <BecaTip title="Pra você entender">
              Patrimônio é quanto teus ativos valem hoje. Resultado é a
              diferença entre isso e o que você pagou — e ele só vira dinheiro
              no bolso quando você vende. Beleza?
            </BecaTip>
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
