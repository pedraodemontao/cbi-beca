import Link from 'next/link';
import { formatBRL } from '@/lib/format';
import type { TickerIncome } from '@/types/portfolio';

interface IncomeByTickerProps {
  byTicker: TickerIncome[];
}

export function IncomeByTicker({ byTicker }: IncomeByTickerProps) {
  if (byTicker.length === 0) return null;

  const max = Math.max(...byTicker.map((entry) => entry.total));

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Proventos por ativo
      </h2>
      <p className="micro-hint">
        Total distribuído por cada ativo desde a data de aquisição.
      </p>

      <ul className="mt-4 flex flex-col gap-4">
        {byTicker.map((entry) => (
          <li key={entry.ticker}>
            <div className="flex items-baseline justify-between gap-3">
              <Link
                href={`/ativo/${entry.ticker}`}
                className="font-extrabold hover:text-primary hover:underline"
              >
                {entry.ticker}
              </Link>
              <span className="num font-extrabold text-primary-deep">
                {formatBRL(entry.total)}
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-primary-surface"
                style={{ width: `${max > 0 ? (entry.total / max) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {entry.payments} pagamento{entry.payments > 1 ? 's' : ''} desde a
              compra
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
