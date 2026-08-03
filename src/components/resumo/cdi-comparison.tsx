import { formatPercent } from '@/lib/format';

interface CdiComparisonProps {
  portfolioPercent: number | null;
  cdiPercent: number | null;
  cdiYearly: number | null;
  since: Date | null;
}

const monthYear = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

export function CdiComparison({
  portfolioPercent,
  cdiPercent,
  cdiYearly,
  since,
}: CdiComparisonProps) {
  if (portfolioPercent === null || cdiPercent === null || since === null) {
    return null;
  }

  const beatsCdi = portfolioPercent >= cdiPercent;
  const widest = Math.max(Math.abs(portfolioPercent), Math.abs(cdiPercent), 0.01);
  const barWidth = (value: number) =>
    `${Math.max(4, (Math.abs(value) / widest) * 100)}%`;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Tua carteira comparada com o CDI
      </h2>
      <p className="micro-hint">
        O CDI é o rendimento de quem deixa o dinheiro parado na renda fixa. É a
        régua pra saber se valeu a pena correr risco.
      </p>

      <div className="mt-5 flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold">Tua carteira</span>
            <span
              className={`num font-extrabold ${
                portfolioPercent >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {formatPercent(portfolioPercent)}
            </span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-background">
            <div
              className={`h-full rounded-full ${
                portfolioPercent >= 0 ? 'bg-primary' : 'bg-negative'
              }`}
              style={{ width: barWidth(portfolioPercent) }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-bold">CDI no mesmo período</span>
            <span className="num font-extrabold text-muted-foreground">
              {formatPercent(cdiPercent)}
            </span>
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-accent-foreground/60"
              style={{ width: barWidth(cdiPercent) }}
            />
          </div>
        </div>
      </div>

      <p className="mt-5 rounded-panel bg-primary-wash px-4 py-3 text-sm font-semibold text-primary-deep">
        {beatsCdi
          ? `Tua carteira rendeu ${formatPercent(portfolioPercent - cdiPercent)} a mais que a renda fixa desde ${monthYear.format(since)}. O risco compensou até aqui.`
          : `A renda fixa rendeu ${formatPercent(cdiPercent - portfolioPercent)} a mais que tua carteira desde ${monthYear.format(since)}. Acontece — carteira de bolsa oscila e se mede em anos, não em meses.`}
      </p>

      {cdiYearly !== null && (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          Hoje o CDI está rendendo cerca de {formatPercent(cdiYearly)} ao ano.
        </p>
      )}
    </section>
  );
}
