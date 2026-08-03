import { formatBRL } from '@/lib/format';
import type { PortfolioSnapshot } from '@/types/portfolio';

interface EvolutionChartProps {
  snapshots: PortfolioSnapshot[];
}

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 6;

const shortDate = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

export function EvolutionChart({ snapshots }: EvolutionChartProps) {
  if (snapshots.length < 2) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">
          Como teu patrimônio cresceu
        </h2>
        <p className="micro-hint">
          Todo dia eu anoto quanto tua carteira vale, pra você ver a linha subir
          com o tempo.
        </p>
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
          {snapshots.length === 0
            ? 'Ainda não tenho histórico suficiente. Volta amanhã que eu já começo a desenhar esse gráfico pra você.'
            : 'Anotei o primeiro dia. Com mais alguns, o gráfico aparece aqui.'}
        </p>
      </section>
    );
  }

  const points = [...snapshots].sort(
    (a, b) => new Date(a.captured_on).getTime() - new Date(b.captured_on).getTime()
  );

  const values = points.flatMap((point) => [point.total_value, point.invested_value]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const toX = (index: number) =>
    PADDING + (index / (points.length - 1)) * (WIDTH - PADDING * 2);
  const toY = (value: number) =>
    HEIGHT - PADDING - ((value - min) / span) * (HEIGHT - PADDING * 2);

  const build = (pick: (point: PortfolioSnapshot) => number) =>
    points.map((point, index) => `${toX(index).toFixed(1)},${toY(pick(point)).toFixed(1)}`).join(' ');

  const totalLine = build((point) => point.total_value);
  const investedLine = build((point) => point.invested_value);

  const first = points[0];
  const last = points[points.length - 1];
  const growth = last.total_value - first.total_value;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Como teu patrimônio cresceu
      </h2>
      <p className="micro-hint">
        A linha cheia é quanto vale hoje. A pontilhada é quanto você colocou.
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-4 h-40 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Patrimônio de ${formatBRL(first.total_value)} para ${formatBRL(last.total_value)}`}
      >
        <defs>
          <linearGradient id="evolutionFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon
          points={`${PADDING},${HEIGHT - PADDING} ${totalLine} ${WIDTH - PADDING},${HEIGHT - PADDING}`}
          fill="url(#evolutionFill)"
        />
        <polyline
          points={investedLine}
          fill="none"
          stroke="var(--muted-fg)"
          strokeWidth="2"
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={totalLine}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="num mt-1 flex justify-between text-xs font-semibold text-muted-foreground">
        <span>{shortDate.format(new Date(first.captured_on))}</span>
        <span>{shortDate.format(new Date(last.captured_on))}</span>
      </div>

      <p className="mt-4 rounded-panel bg-primary-wash px-4 py-3 text-sm font-semibold text-primary-deep">
        {growth >= 0
          ? `Teu patrimônio subiu ${formatBRL(growth)} desde que comecei a acompanhar.`
          : `Teu patrimônio caiu ${formatBRL(Math.abs(growth))} nesse período. Oscilação faz parte — o que conta é a linha no longo prazo.`}
      </p>
    </section>
  );
}
