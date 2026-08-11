import { formatBRL, formatPercent } from '@/lib/format';
import type { AssetTypeAllocation } from '@/types/portfolio';

const LABELS = {
  stock: 'Ações',
  fii: 'Fundos imobiliários',
} as const;

const COLORS = {
  stock: 'bg-primary',
  fii: 'bg-muted-foreground',
} as const;

interface AllocationBarProps {
  allocation: AssetTypeAllocation[];
}

export function AllocationBar({ allocation }: AllocationBarProps) {
  if (allocation.length === 0) return null;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Composição por tipo de ativo
      </h2>
      <p className="micro-hint">
        Participação de cada classe no valor total da carteira.
      </p>

      <div
        className="mt-5 flex h-4 overflow-hidden rounded-full bg-background"
        role="img"
        aria-label={allocation
          .map(
            (slice) =>
              `${LABELS[slice.assetType]}: ${formatPercent(slice.percentage)}`
          )
          .join(', ')}
      >
        {allocation.map((slice) => (
          <div
            key={slice.assetType}
            className={COLORS[slice.assetType]}
            style={{ width: `${slice.percentage}%` }}
          />
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {allocation.map((slice) => (
          <li
            key={slice.assetType}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2 font-bold">
              <span
                aria-hidden
                className={`size-3 rounded-full ${COLORS[slice.assetType]}`}
              />
              {LABELS[slice.assetType]}
            </span>
            <span className="num font-semibold text-muted-foreground">
              {formatBRL(slice.value)} · {formatPercent(slice.percentage)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
