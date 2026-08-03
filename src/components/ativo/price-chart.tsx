import { formatBRL } from '@/lib/format';
import type { BrapiHistoricalPrice } from '@/lib/brapi';

interface PriceChartProps {
  history: BrapiHistoricalPrice[];
}

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = 6;

export function PriceChart({ history }: PriceChartProps) {
  // brapi devolve do mais recente pro mais antigo
  const points = [...history].sort((a, b) => a.date - b.date);
  if (points.length < 2) return null;

  const closes = points.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;

  const toX = (index: number) =>
    PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
  const toY = (close: number) =>
    HEIGHT - PADDING - ((close - min) / span) * (HEIGHT - PADDING * 2);

  const line = points
    .map((point, index) => `${toX(index).toFixed(1)},${toY(point.close).toFixed(1)}`)
    .join(' ');
  const area = `${PADDING},${HEIGHT - PADDING} ${line} ${(WIDTH - PADDING).toFixed(1)},${HEIGHT - PADDING}`;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const isUp = last >= first;
  const stroke = isUp ? 'var(--primary)' : 'var(--negative)';

  return (
    <figure className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-44 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Variação do preço no período: de ${formatBRL(first)} para ${formatBRL(last)}`}
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill="url(#priceFill)" />
        <polyline
          points={line}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="num flex justify-between text-xs font-semibold text-muted-foreground">
        <span>{formatBRL(min)} (mínima)</span>
        <span>{formatBRL(max)} (máxima)</span>
      </figcaption>
    </figure>
  );
}
