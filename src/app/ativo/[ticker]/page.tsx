import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getDividends,
  getHistorical,
  getQuote,
  getStatistics,
  type HistoricalRange,
} from '@/lib/brapi';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/format';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BecaTip } from '@/components/shared/beca-tip';
import { AssetLogo } from '@/components/shared/asset-logo';
import { fetchCeilingAssets, fetchAppliedOverrides } from '@/lib/ceiling-data';
import { PriceChart } from '@/components/ativo/price-chart';
import { CeilingCard } from '@/components/ativo/ceiling-card';
import { Fundamentals } from '@/components/ativo/fundamentals';
import { DividendsHistory } from '@/components/ativo/dividends-history';
import type { AssetType, PositionRow } from '@/types/portfolio';

const RANGE: HistoricalRange = '3mo';

export default async function AtivoPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  const ticker = decodeURIComponent(rawTicker).toUpperCase();

  if (!/^[A-Z0-9]{4,10}$/.test(ticker)) {
    notFound();
  }

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
    .eq('ticker', ticker);
  const positions = (rows ?? []) as PositionRow[];
  const assetType: AssetType = positions[0]?.asset_type ?? 'stock';

  const [quotes, statistics, history, dividends, ceilingAssets, overrides] =
    await Promise.all([
      getQuote([ticker]),
      getStatistics(ticker),
      getHistorical(ticker, RANGE),
      getDividends(ticker, assetType),
      fetchCeilingAssets(supabase, { tickers: [ticker] }),
      fetchAppliedOverrides(supabase),
    ]);

  const ceilingAsset = ceilingAssets[0] ?? null;

  const quote = quotes?.[0] ?? null;
  const dayChange = quote?.regularMarketChangePercent ?? null;

  const totalQuantity = positions.reduce((sum, p) => sum + p.quantity, 0);
  const investedValue = positions.reduce(
    (sum, p) => sum + p.quantity * p.avg_price,
    0
  );
  const currentValue =
    quote && totalQuantity > 0 ? quote.regularMarketPrice * totalQuantity : null;
  const profit = currentValue !== null ? currentValue - investedValue : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <div>
          <Link
            href="/carteira"
            className="text-sm font-bold text-primary hover:underline"
          >
            ← Voltar pra carteira
          </Link>
        </div>

        <header className="card-lg">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <AssetLogo ticker={ticker} url={ceilingAsset?.logoUrl ?? null} size={48} />
              <div>
                <h1 className="text-[clamp(1.8rem,6vw,2.2rem)] font-extrabold tracking-tight">
                  {ticker}
                </h1>
                {quote?.longName && (
                  <p className="text-[0.95rem] font-medium text-muted-foreground">
                    {quote.longName}
                  </p>
                )}
              </div>
            </div>
            {dayChange !== null && (
              <span className={`chip ${dayChange >= 0 ? 'chip-up' : 'chip-down'}`}>
                {dayChange >= 0 ? '↑' : '↓'} {formatPercent(dayChange)} hoje
              </span>
            )}
          </div>

          {quote ? (
            <>
              <p className="micro-label mt-5">Preço agora</p>
              <p className="num text-[clamp(2rem,7vw,2.6rem)] font-extrabold leading-tight">
                {formatBRL(quote.regularMarketPrice)}
              </p>
            </>
          ) : (
            <p className="mt-5 rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
              Não consegui buscar a cotação agora. Tenta recarregar daqui a
              pouco.
            </p>
          )}
        </header>

        {ceilingAsset && (
          <CeilingCard
            asset={ceilingAsset}
            override={overrides.get(ticker)}
            livePrice={quote?.regularMarketPrice ?? null}
          />
        )}

        {history && history.length > 1 && (
          <section className="card-lg">
            <h2 className="text-lg font-extrabold tracking-tight">
              Como o preço andou
            </h2>
            <p className="micro-hint">
              Últimos 3 meses. Sobe e desce faz parte — o que importa é a
              tendência, não o susto do dia.
            </p>
            <div className="mt-4">
              <PriceChart history={history} />
            </div>
          </section>
        )}

        {totalQuantity > 0 && (
          <section className="card-lg">
            <h2 className="text-lg font-extrabold tracking-tight">
              O que você tem desse ativo
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Quantidade
                </dt>
                <dd className="num mt-0.5 font-extrabold">
                  {formatQuantity(totalQuantity)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Investido
                </dt>
                <dd className="num mt-0.5 font-extrabold">
                  {formatBRL(investedValue)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Vale hoje
                </dt>
                <dd className="num mt-0.5 font-extrabold">
                  {currentValue !== null ? formatBRL(currentValue) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-muted-foreground">
                  Resultado
                </dt>
                <dd
                  className={`num mt-0.5 font-extrabold ${
                    profit === null
                      ? 'text-muted-foreground'
                      : profit >= 0
                        ? 'text-positive'
                        : 'text-negative'
                  }`}
                >
                  {profit === null
                    ? '—'
                    : `${profit >= 0 ? '+' : ''}${formatBRL(profit)}`}
                </dd>
              </div>
            </dl>
          </section>
        )}

        <Fundamentals statistics={statistics} />

        <DividendsHistory dividends={dividends} />

        <BecaTip title="Importante">
          Esses números explicam o passado e o presente do ativo — nenhum deles
          prevê o futuro. Isso aqui é conteúdo educacional, não é recomendação
          de compra ou venda. A decisão é sempre sua.
        </BecaTip>
      </main>
      <BottomNav />
    </>
  );
}
