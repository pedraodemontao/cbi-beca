import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { buildPortfolioSummary, groupByTicker } from '@/lib/portfolio';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import { fetchCeilingAssets, fetchAppliedOverrides } from '@/lib/ceiling-data';
import { buildCeilingProjection, DEFAULT_PAYOUT } from '@/lib/ceiling-price';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { AddPositionForm } from '@/components/carteira/add-position-form';
import { PositionsGrid } from '@/components/carteira/positions-grid';
import { WealthCard } from '@/components/carteira/wealth-card';
import { BecaTip } from '@/components/shared/beca-tip';
import type { PositionRow } from '@/types/portfolio';

export default async function CarteiraPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: rows } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: true });
  const positions = (rows ?? []) as PositionRow[];

  const tickers = [...new Set(positions.map((p) => p.ticker))];
  const [quotes, incomeReport, ceilingAssets, overrides] = await Promise.all([
    tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
    buildDividendIncomeReport(supabase, positions),
    fetchCeilingAssets(supabase, { tickers }),
    fetchAppliedOverrides(supabase),
  ]);

  // Teto de 6% por ticker — é o que cada card compara com o preço de hoje.
  const ceilings = new Map<string, number>();
  for (const asset of ceilingAssets) {
    const override = overrides.get(asset.ticker);
    const { ceilings: byYield } = buildCeilingProjection({
      price: asset.price,
      reportedProfit: asset.netIncome,
      manualProfit: override?.manualProfit ?? null,
      sharesOutstanding: asset.sharesOutstanding,
      bookValuePerShare: asset.vpa,
      payout: override?.payout ?? DEFAULT_PAYOUT,
    });
    const ceiling = byYield[0]?.ceiling;
    if (ceiling !== null && ceiling !== undefined) {
      ceilings.set(asset.ticker, ceiling);
    }
  }
  const quoteMap = new Map<string, BrapiQuote>(
    (quotes ?? []).map((quote) => [quote.symbol, quote])
  );

  const summary = buildPortfolioSummary(positions, quoteMap);
  const dayChangePercent = weightedDayChange(summary.positions, quoteMap);

  const firstName = (
    (user.user_metadata.display_name as string | undefined) ??
    user.email ??
    ''
  ).split(' ')[0];

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <AppHeader
          greeting={`Oi, ${firstName}!`}
          subtitle="Bora ver como teu dinheiro tá indo?"
        />

        {positions.length === 0 ? (
          <BecaTip>
            Começa cadastrando o que você já tem. Não precisa ser muito — o
            importante é enxergar teu dinheiro com clareza.
          </BecaTip>
        ) : (
          <WealthCard
            summary={summary}
            dayChangePercent={dayChangePercent}
            totalReceived={incomeReport.totalReceived}
          />
        )}

        <AddPositionForm />

        <PositionsGrid
          holdings={groupByTicker(summary.positions)}
          positions={positions}
          quoteMap={quoteMap}
          ceilings={ceilings}
        />
      </main>
      <BottomNav />
    </>
  );
}

/** Variação do dia da carteira, ponderada pelo valor de cada posição. */
function weightedDayChange(
  valuations: { ticker: string; currentValue: number | null }[],
  quoteMap: Map<string, BrapiQuote>
): number | null {
  let weighted = 0;
  let base = 0;

  for (const valuation of valuations) {
    const change = quoteMap.get(valuation.ticker)?.regularMarketChangePercent;
    if (valuation.currentValue === null || typeof change !== 'number') continue;
    weighted += valuation.currentValue * change;
    base += valuation.currentValue;
  }

  return base > 0 ? weighted / base : null;
}
