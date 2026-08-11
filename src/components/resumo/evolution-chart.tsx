import { formatBRL } from '@/lib/format';
import type { PortfolioSnapshot } from '@/types/portfolio';

interface EvolutionChartProps {
  snapshots: PortfolioSnapshot[];
}

const WIDTH = 600;
const HEIGHT = 160;
const PADDING = 6;

export function EvolutionChart({ snapshots }: EvolutionChartProps) {
  if (snapshots.length < 2) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">
          Evolução do patrimônio
        </h2>
        <p className="micro-hint">
          O valor da carteira é registrado diariamente para compor o histórico
          com o tempo.
        </p>
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
          {snapshots.length === 0
            ? 'Histórico insuficiente para gerar o gráfico. O primeiro registro é feito no próximo fechamento.'
            : 'Primeiro registro efetuado. O gráfico é exibido a partir do segundo dia de histórico.'}
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
        Evolução do patrimônio
      </h2>
      <p className="micro-hint">
        A linha contínua indica o valor de mercado; a pontilhada, o total investido.
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
        {/* `captured_on` é coluna `date`, sem hora: `new Date` daquilo é
            meia-noite UTC e, formatado em São Paulo, voltava um dia. */}
        <span>{formatDay(first.captured_on)}</span>
        <span>{formatDay(last.captured_on)}</span>
      </div>

      <p className="mt-4 rounded-panel bg-primary-wash px-4 py-3 text-sm font-semibold text-primary-deep">
        {growth >= 0
          ? `O patrimônio subiu ${formatBRL(growth)} desde o início do acompanhamento.`
          : `O patrimônio caiu ${formatBRL(Math.abs(growth))} no período. Oscilação é esperada em renda variável.`}
      </p>
    </section>
  );
}

/** Data pura (YYYY-MM-DD) em dd/mm, sem passar por fuso. */
function formatDay(date: string): string {
  const [, month, day] = date.split('-');
  return `${day}/${month}`;
}
