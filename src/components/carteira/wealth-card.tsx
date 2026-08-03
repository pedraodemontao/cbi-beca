import Link from 'next/link';
import { formatBRL, formatPercent } from '@/lib/format';
import type { PortfolioSummary } from '@/types/portfolio';

interface WealthCardProps {
  summary: PortfolioSummary;
  dayChangePercent: number | null;
  totalReceived: number;
}

export function WealthCard({
  summary,
  dayChangePercent,
  totalReceived,
}: WealthCardProps) {
  const { totalValue, investedValue, profit, profitPercent } = summary;
  const isUp = profit >= 0;

  return (
    <section className="card-lg">
      <p className="micro-label">Teu patrimônio</p>
      <p className="micro-hint">quanto teu dinheiro vale hoje, tudo somado</p>

      <div className="mt-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
        <strong className="num text-[clamp(2.3rem,9vw,3.2rem)] font-extrabold leading-none tracking-tight">
          {formatBRL(totalValue)}
        </strong>
        {dayChangePercent !== null && (
          <span className={`chip ${dayChangePercent >= 0 ? 'chip-up' : 'chip-down'}`}>
            {dayChangePercent >= 0 ? '↑' : '↓'} {formatPercent(dayChangePercent)} hoje
          </span>
        )}
      </div>

      {summary.hasMissingQuotes && (
        <p className="mt-3 rounded-panel bg-accent px-3.5 py-2.5 text-sm font-medium text-accent-text">
          Alguns preços não carregaram agora — o total considera só os ativos
          com cotação. Daqui a pouco tenta de novo.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <dt className="micro-hint">Quanto ele cresceu desde que você começou</dt>
          <dd
            className={`num mt-1 text-xl font-extrabold ${
              isUp ? 'text-positive' : 'text-negative'
            }`}
          >
            {isUp ? '+' : ''}
            {formatBRL(profit)}
            {profitPercent !== null && (
              <span className="ml-2 text-base font-bold">
                ({formatPercent(profitPercent)})
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="micro-hint">Quanto você colocou do teu bolso</dt>
          <dd className="num mt-1 text-xl font-extrabold text-foreground">
            {formatBRL(investedValue)}
          </dd>
        </div>
      </dl>

      {totalReceived > 0 && (
        <Link
          href="/proventos"
          className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-primary-wash px-4 py-3.5 transition-colors hover:bg-primary-tint"
        >
          <span>
            <span className="micro-hint block">
              E além disso já pingou na tua conta
            </span>
            <span className="num text-xl font-extrabold text-primary-deep">
              {formatBRL(totalReceived)}
            </span>
          </span>
          <span className="text-sm font-bold text-primary-deep">ver →</span>
        </Link>
      )}
    </section>
  );
}
