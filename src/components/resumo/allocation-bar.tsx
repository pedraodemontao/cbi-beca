import { formatBRL, formatPercent } from '@/lib/format';
import { ASSET_TYPE_LABEL_LONG } from '@/lib/asset-type';
import type { AssetType, AssetTypeAllocation } from '@/types/portfolio';

const LABELS = ASSET_TYPE_LABEL_LONG;

/**
 * Três classes, três cores que se separam. O BDR entra no verde de mercado
 * (`positive`) e não numa terceira tonalidade de ouro: com ouro e cinza já
 * ocupados, mais um ouro viraria a mesma barra repetida. Aqui verde é
 * categoria, não alta — a barra não fala de direção de preço.
 */
const COLORS: Record<AssetType, string> = {
  stock: 'bg-primary-surface',
  fii: 'bg-muted-foreground',
  bdr: 'bg-positive',
};

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
