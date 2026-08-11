import type { BrapiStatistics } from '@/lib/brapi';

interface FundamentalsProps {
  statistics: BrapiStatistics | null;
}

interface Indicator {
  label: string;
  value: string;
  hint: string;
}

const decimal = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Indicadores que a brapi realmente preenche na B3, cada um traduzido. */
function buildIndicators(stats: BrapiStatistics): Indicator[] {
  const list: Indicator[] = [];
  const pe = stats.trailingPE ?? stats.priceEarnings;

  if (typeof pe === 'number') {
    list.push({
      label: 'P/L',
      value: decimal.format(pe),
      hint: `Preço da ação dividido pelo lucro por ação. O valor de ${decimal.format(pe)} indica quantos anos de lucro atual seriam necessários para equivaler ao preço pago.`,
    });
  }

  if (typeof stats.priceToBook === 'number') {
    list.push({
      label: 'P/VP',
      value: decimal.format(stats.priceToBook),
      hint:
        stats.priceToBook > 1
          ? 'Cotação acima do valor patrimonial por ação. O mercado precifica a empresa acima do registrado em balanço.'
          : 'Cotação abaixo do valor patrimonial por ação. O indicador isolado não distingue ativo descontado de deterioração do negócio.',
    });
  }

  if (typeof stats.dividendYield === 'number') {
    list.push({
      label: 'Dividend Yield',
      value: percent.format(stats.dividendYield),
      hint: 'Proventos distribuídos nos últimos 12 meses em relação à cotação atual, em percentual ao ano.',
    });
  }

  if (typeof stats.beta === 'number') {
    list.push({
      label: 'Beta',
      value: decimal.format(stats.beta),
      hint:
        stats.beta > 1
          ? 'Oscila mais que o índice de referência, tanto na alta quanto na queda.'
          : 'Oscila menos que o índice de referência.',
    });
  }

  if (typeof stats.earningsPerShare === 'number') {
    list.push({
      label: 'Lucro por ação',
      value: `R$ ${decimal.format(stats.earningsPerShare)}`,
      hint: 'Quanto de lucro a empresa gerou no ano para cada ação que existe.',
    });
  }

  if (typeof stats.profitMargins === 'number') {
    list.push({
      label: 'Margem de lucro',
      value: percent.format(stats.profitMargins),
      hint: 'De cada real que a empresa vende, quanto sobra de lucro no fim.',
    });
  }

  return list;
}

export function Fundamentals({ statistics }: FundamentalsProps) {
  const indicators = statistics ? buildIndicators(statistics) : [];

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Os números da empresa
      </h2>
      <p className="micro-hint">
        Cada indicador com a tradução do que ele quer dizer.
      </p>

      {indicators.length === 0 ? (
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
          Os indicadores desse ativo não estão disponíveis agora. FIIs quase
          nunca têm esses números — eles se avaliam por outros critérios, como o
          rendimento mensal ali embaixo.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {indicators.map((indicator) => (
            <li key={indicator.label} className="py-4 first:pt-0 last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-extrabold">{indicator.label}</h3>
                <span className="num text-lg font-extrabold text-primary-deep">
                  {indicator.value}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-muted-foreground">
                {indicator.hint}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
