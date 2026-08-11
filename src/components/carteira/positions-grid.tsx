import { PositionCard } from '@/components/carteira/position-card';
import type { BrapiQuote } from '@/lib/brapi';
import type { PositionRow, TickerHolding } from '@/types/portfolio';

interface PositionsGridProps {
  holdings: TickerHolding[];
  positions: PositionRow[];
  quoteMap: Map<string, BrapiQuote>;
  /** Teto de 6% por ticker, calculado no servidor. */
  ceilings: Map<string, number>;
  /** logo_url por ticker, vindo do catálogo. */
  logos: Map<string, string | null>;
}

export function PositionsGrid({
  holdings,
  positions,
  quoteMap,
  ceilings,
  logos,
}: PositionsGridProps) {
  if (holdings.length === 0) {
    return (
      <section className="rounded-card border-2 border-dashed border-border bg-surface/50 px-6 py-14 text-center">
        <p className="text-lg font-extrabold">Nenhuma posição cadastrada</p>
        <p className="mx-auto mt-2 max-w-sm text-[0.95rem] font-medium text-muted-foreground">
          Use o formulário acima para registrar ações ou fundos listados. A
          cotação é consultada automaticamente.
        </p>
      </section>
    );
  }

  const purchaseDates = new Map(
    positions.map((position) => [position.id, position.purchase_date])
  );

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">Ativos em carteira</h2>
        <p className="micro-hint">Um cartãozinho pra cada coisa que você tem.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {holdings.map((holding) => (
          <PositionCard
            key={holding.ticker}
            holding={holding}
            purchaseDates={purchaseDates}
            dayChangePercent={
              quoteMap.get(holding.ticker)?.regularMarketChangePercent ?? null
            }
            ceiling={ceilings.get(holding.ticker) ?? null}
          logoUrl={logos.get(holding.ticker) ?? null}
          />
        ))}
      </div>
    </section>
  );
}
