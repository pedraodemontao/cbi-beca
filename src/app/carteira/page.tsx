import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { getCryptoQuotes } from '@/lib/coingecko';
import { buildPortfolioSummary, groupByTicker } from '@/lib/portfolio';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import { fetchCeilingAssets, fetchAppliedOverrides } from '@/lib/ceiling-data';
import { fetchFixedIncome } from '@/lib/fixed-income-data';
import { buildCeilingProjection, fiiCeiling, DEFAULT_PAYOUT } from '@/lib/ceiling-price';
import { AppHeader } from '@/components/layout/app-header';
import { BottomNav } from '@/components/layout/bottom-nav';
import { AddPositionForm } from '@/components/carteira/add-position-form';
import { FixedIncomeSection } from '@/components/carteira/fixed-income-section';
import { PositionsGrid } from '@/components/carteira/positions-grid';
import { WealthCard } from '@/components/carteira/wealth-card';
import { InfoNote } from '@/components/shared/info-note';
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

  // Cripto e bolsa vêm de fontes diferentes: a brapi não serve criptomoeda no
  // plano contratado (403, exige Startup a R$ 119,99/mês) e a CoinGecko não
  // serve ação. O `tickers` de mercado exclui cripto pra não pedir BTC à brapi
  // e receber "não encontrado" a cada pageview.
  const marketTickers = [
    ...new Set(
      positions.filter((p) => p.asset_type !== 'crypto').map((p) => p.ticker)
    ),
  ];
  const cryptoTickers = [
    ...new Set(
      positions.filter((p) => p.asset_type === 'crypto').map((p) => p.ticker)
    ),
  ];
  const tickers = marketTickers;

  const [quotes, cryptoQuotes, incomeReport, ceilingAssets, overrides, fixedIncome] = await Promise.all([
    tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
    cryptoTickers.length > 0
      ? getCryptoQuotes(cryptoTickers)
      : Promise.resolve<BrapiQuote[]>([]),
    buildDividendIncomeReport(supabase, positions),
    fetchCeilingAssets(supabase, { tickers }),
    fetchAppliedOverrides(supabase),
    fetchFixedIncome(supabase),
  ]);

  // Teto por ticker — é o que cada card compara com o preço de hoje. Ação sai do
  // lucro projetado; FII não tem lucro por cota e sai do rendimento pago, na
  // mesma conta da aba de fundos.
  const ceilings = new Map<string, number>();
  const logos = new Map<string, string | null>();
  for (const asset of ceilingAssets) {
    logos.set(asset.ticker, asset.logoUrl);

    const override = overrides.get(asset.ticker);
    const ceiling =
      asset.assetType === 'fii'
        ? fiiCeiling(asset.dividends12m)
        : (buildCeilingProjection({
            price: asset.price,
            reportedProfit: asset.netIncome,
            manualProfit: override?.manualProfit ?? null,
            sharesOutstanding: asset.sharesOutstanding,
            bookValuePerShare: asset.vpa,
            payout: override?.payout ?? DEFAULT_PAYOUT,
          }).ceilings[0]?.ceiling ?? null);

    if (ceiling !== null) ceilings.set(asset.ticker, ceiling);
  }
  // As duas fontes entram no mesmo mapa: `getCryptoQuotes` devolve `BrapiQuote`
  // de propósito, pra que todo o cálculo de patrimônio continue sem saber de
  // onde veio o preço.
  const quoteMap = new Map<string, BrapiQuote>(
    [...(quotes ?? []), ...(cryptoQuotes ?? [])].map((quote) => [
      quote.symbol,
      quote,
    ])
  );

  const summary = buildPortfolioSummary(positions, quoteMap);
  const dayChangePercent = weightedDayChange(summary.positions, quoteMap);

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <AppHeader
          title="Carteira"
          subtitle="Posições cadastradas, preço médio e cotação atual."
        />

        {/* O card aparece com renda fixa sozinha também: quem só tem CDB
            cadastrado tem patrimônio, e cair no estado vazio esconderia o
            número que ela acabou de cadastrar. */}
        {positions.length === 0 && fixedIncome.holdings.length === 0 ? (
          <InfoNote>
            Cadastre os ativos que você já possui para acompanhar posição, preço
            médio e proventos.
          </InfoNote>
        ) : (
          <WealthCard
            summary={summary}
            dayChangePercent={dayChangePercent}
            totalReceived={incomeReport.netReceived}
            fixedIncomeNet={fixedIncome.totalNet}
          />
        )}

        <AddPositionForm />

        <FixedIncomeSection summary={fixedIncome} />

        <PositionsGrid
          holdings={groupByTicker(summary.positions)}
          positions={positions}
          quoteMap={quoteMap}
          ceilings={ceilings}
            logos={logos}
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
