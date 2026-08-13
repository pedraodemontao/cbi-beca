'use client';

import { useState } from 'react';
import { formatIndexPoints, formatPlainDay } from '@/lib/format';
import { bandFor, type RadarPoint } from '@/lib/market-radar';

interface RadarChartProps {
  points: RadarPoint[];
}

const WIDTH = 900;
const HEIGHT = 300;

/**
 * Folga só na vertical. Na horizontal o gráfico encosta nas bordas de
 * propósito: sem recuo lateral, a posição do cursor vira a fração exata do
 * índice do ponto, e o hover não precisa medir nada além da largura do
 * elemento.
 */
const PADDING_Y = 10;

/**
 * Ibovespa colorido pela posição dentro da faixa de 12 meses.
 *
 * O SVG não tem texto nenhum: com `preserveAspectRatio="none"` a caixa estica
 * na horizontal pra ocupar a largura da tela, e letra esticada fica torta. Os
 * rótulos são HTML em volta — é o mesmo arranjo do gráfico de evolução e do de
 * preço.
 */
export function RadarChart({ points }: RadarChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (points.length < 2) return null;

  const closes = points.map((point) => point.close);
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const span = high - low || 1;

  const toX = (index: number) => (index / (points.length - 1)) * WIDTH;
  const toY = (close: number) =>
    HEIGHT - PADDING_Y - ((close - low) / span) * (HEIGHT - PADDING_Y * 2);

  const segments = buildBandSegments(points);

  const first = points[0];
  const last = points[points.length - 1];
  const active = hovered != null ? points[hovered] : null;
  const activeBand = active ? bandFor(active.position) : null;
  const activeFraction = hovered != null ? hovered / (points.length - 1) : 0;

  return (
    <figure className="flex flex-col gap-2">
      <div
        className="relative touch-pan-y"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          if (!rect.width) return;
          const fraction = Math.min(
            1,
            Math.max(0, (event.clientX - rect.left) / rect.width)
          );
          setHovered(Math.round(fraction * (points.length - 1)));
        }}
        onPointerLeave={() => setHovered(null)}
      >
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-56 w-full sm:h-72"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Ibovespa de ${formatPlainDay(first.day)} a ${formatPlainDay(last.day)}: de ${formatIndexPoints(first.close)} para ${formatIndexPoints(last.close)} pontos. Posição atual na faixa de 12 meses: ${last.position.toFixed(0)}%.`}
        >
          {segments.map((segment, index) => (
            <polyline
              key={`${segment.band.key}-${index}`}
              points={segment.indexes
                .map((point) => `${toX(point).toFixed(1)},${toY(points[point].close).toFixed(1)}`)
                .join(' ')}
              fill="none"
              stroke={segment.band.color}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        {/* Guia, ponto e balão são HTML: dentro do SVG esticado o círculo
            viraria elipse e o balão herdaria a mesma distorção. */}
        {active && activeBand && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-border"
              style={{ left: `${activeFraction * 100}%` }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
              style={{
                left: `${activeFraction * 100}%`,
                top: `${(toY(active.close) / HEIGHT) * 100}%`,
                backgroundColor: activeBand.color,
              }}
            />
            <div
              className="num pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-panel border border-border bg-panel px-3 py-2 text-xs font-semibold shadow-soft"
              style={{
                left: `${activeFraction * 100}%`,
                transform: `translateX(${
                  activeFraction < 0.18
                    ? '0'
                    : activeFraction > 0.82
                      ? '-100%'
                      : '-50%'
                })`,
              }}
            >
              <span className="block text-muted-foreground">
                {formatPlainDay(active.day)}
              </span>
              <span className="block text-foreground">
                {formatIndexPoints(active.close)} pts
              </span>
              <span className="block" style={{ color: activeBand.color }}>
                {active.position.toFixed(1)}% · {activeBand.label}
              </span>
            </div>
          </>
        )}
      </div>

      {/* A 375px os três rótulos não cabem na mesma linha e encostavam um no
          outro ("15/08/2025134.432"). A faixa desce pra linha de baixo no
          celular e volta pro meio a partir do `sm`. */}
      <figcaption className="num flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
        <span>{formatPlainDay(first.day)}</span>
        <span className="order-last w-full text-center sm:order-none sm:w-auto sm:text-left">
          {formatIndexPoints(low)} – {formatIndexPoints(high)} pts no gráfico
        </span>
        <span>{formatPlainDay(last.day)}</span>
      </figcaption>
    </figure>
  );
}

interface BandSegment {
  band: ReturnType<typeof bandFor>;
  indexes: number[];
}

/**
 * Agrupa pregões consecutivos da mesma faixa numa `polyline` só.
 *
 * A referência desenhava uma `<line>` por pregão — 248 nós de SVG pra colorir
 * uma linha que muda de cor umas poucas dezenas de vezes. Cada segmento novo
 * começa no ponto ANTERIOR à virada, senão a troca de cor abriria um buraco de
 * um pregão na linha.
 */
function buildBandSegments(points: RadarPoint[]): BandSegment[] {
  const segments: BandSegment[] = [];

  points.forEach((point, index) => {
    const band = bandFor(point.position);
    const current = segments[segments.length - 1];

    if (!current || current.band.key !== band.key) {
      segments.push({
        band,
        indexes: index === 0 ? [0] : [index - 1, index],
      });
      return;
    }

    current.indexes.push(index);
  });

  return segments;
}
