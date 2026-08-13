import { RADAR_BANDS, bandFor } from '@/lib/market-radar';

interface RadarGaugeProps {
  /** Posição na faixa, de 0 a 100. */
  position: number;
}

const WIDTH = 320;
const HEIGHT = 200;
const CX = 160;
const CY = 178;
const RADIUS = 118;
const ARC_WIDTH = 20;

/**
 * Meia-lua com as cinco faixas e o ponteiro na posição do dia.
 *
 * Aqui o `preserveAspectRatio` é o padrão (`meet`): o desenho é redondo e não
 * pode esticar, e é por isso que os números do eixo podem viver dentro do SVG —
 * ao contrário do gráfico de linha, que estica na horizontal.
 */
export function RadarGauge({ position }: RadarGaugeProps) {
  const clamped = Math.min(100, Math.max(0, position));
  const band = bandFor(clamped);
  const needle = polar(RADIUS - 34, angleFor(clamped));

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Ponteiro em ${clamped.toFixed(0)} de 100: ${band.label}.`}
    >
      {RADAR_BANDS.map((entry, index) => (
        <path
          key={entry.key}
          d={arcPath(RADIUS, angleFor(index * 20), angleFor((index + 1) * 20))}
          fill="none"
          stroke={entry.color}
          strokeWidth={ARC_WIDTH}
          // Só as pontas do arco inteiro são arredondadas; no meio, emenda reta,
          // senão as faixas se sobrepõem e a cor suja a vizinha.
          strokeLinecap={
            index === 0 || index === RADAR_BANDS.length - 1 ? 'round' : 'butt'
          }
        />
      ))}

      {[0, 50, 100].map((tick) => {
        const spot = polar(RADIUS + 21, angleFor(tick));
        return (
          <text
            key={tick}
            x={spot.x}
            y={spot.y + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="var(--muted-fg)"
          >
            {tick}
          </text>
        );
      })}

      <line
        x1={CX}
        y1={CY}
        x2={needle.x}
        y2={needle.y}
        stroke="var(--foreground)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx={CX} cy={CY} r="7" fill="var(--foreground)" />
    </svg>
  );
}

/** 0 na régua fica à esquerda (180°) e 100 à direita (0°). */
function angleFor(value: number): number {
  return 180 - (Math.min(100, Math.max(0, value)) / 100) * 180;
}

function polar(radius: number, angleDegrees: number) {
  const radians = (angleDegrees * Math.PI) / 180;
  return {
    x: CX + radius * Math.cos(radians),
    // O eixo Y do SVG cresce pra baixo, e o ângulo cresce pra cima.
    y: CY - radius * Math.sin(radians),
  };
}

function arcPath(radius: number, from: number, to: number): string {
  const start = polar(radius, from);
  const end = polar(radius, to);
  const largeArc = Math.abs(from - to) > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}
