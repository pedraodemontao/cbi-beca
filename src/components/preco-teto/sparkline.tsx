/**
 * Linha do preço nos últimos 30 dias.
 *
 * SVG puro, sem biblioteca: são no máximo 30 pontos e a tabela desenha dezenas
 * deles por vez — qualquer runtime de gráfico aqui pesaria mais que o dado.
 */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ values, width = 72, height = 24 }: SparklineProps) {
  if (values.length < 2) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    // Sem variação no período a linha fica no meio, em vez de dividir por zero.
    const y = span === 0 ? height / 2 : height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = values[values.length - 1]! >= values[0]!;
  const stroke = isUp ? 'var(--positive)' : 'var(--negative)';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      role="img"
      aria-label={`Preço ${isUp ? 'subiu' : 'caiu'} nos últimos 30 dias`}
      className="overflow-visible"
    >
      <polyline
        points={points.join(' ')}
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={width}
        cy={points[points.length - 1]!.split(',')[1]}
        r={2}
        fill={stroke}
      />
    </svg>
  );
}
