import { formatBRL, formatPercent } from '@/lib/format';
import { ALLOCATION_COLOR, ALLOCATION_LABEL } from '@/lib/asset-type';
import type { AllocationSlice } from '@/lib/portfolio';

interface AllocationBarProps {
  allocation: AllocationSlice[];
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
              `${ALLOCATION_LABEL[slice.class]}: ${formatPercent(slice.percentage)}`
          )
          .join(', ')}
      >
        {allocation.map((slice) => (
          <div
            key={slice.class}
            className={ALLOCATION_COLOR[slice.class]}
            style={{ width: `${slice.percentage}%` }}
          />
        ))}
      </div>

      <ul className="mt-4 flex flex-col gap-2.5">
        {allocation.map((slice) => (
          <li
            key={slice.class}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="flex items-center gap-2 font-bold">
              <span
                aria-hidden
                className={`size-3 rounded-full ${ALLOCATION_COLOR[slice.class]}`}
              />
              {ALLOCATION_LABEL[slice.class]}
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
