import { formatBRL, formatPercent } from '@/lib/format';
import { ASSET_TYPE_LABEL_LONG } from '@/lib/asset-type';
import type { AssetType, AssetTypeAllocation } from '@/types/portfolio';

const LABELS = ASSET_TYPE_LABEL_LONG;

/**
 * Uma cor por classe, todas tiradas de tokens que já existem.
 *
 * Verde e coral aqui são CATEGORIA, não direção: esta barra mostra quanto de
 * cada tipo a pessoa tem, e não se subiu ou caiu. Foram escolhidos por
 * eliminação — com ouro e cinza ocupados, um terceiro ouro viraria a mesma
 * barra repetida.
 *
 * Isto não escala. Renda fixa, Tesouro e cripto estão na fila, e aí não há
 * mais token de mercado pra emprestar sem a barra virar sopa. Quando a quarta
 * classe entrar, a saída é uma rampa categórica de verdade — não mais um
 * empréstimo.
 */
const COLORS: Record<AssetType, string> = {
  stock: 'bg-primary-surface',
  fii: 'bg-muted-foreground',
  bdr: 'bg-positive',
  etf: 'bg-negative',
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
