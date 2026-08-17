import { formatBRL } from '@/lib/format';
import type { MonthlyIncome } from '@/types/portfolio';

interface MonthlyIncomeChartProps {
  monthly: MonthlyIncome[];
}

const MONTH_LABELS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

function label(month: string): string {
  const [, monthPart] = month.split('-');
  return MONTH_LABELS[Number(monthPart) - 1] ?? month;
}

export function MonthlyIncomeChart({ monthly }: MonthlyIncomeChartProps) {
  if (monthly.length === 0) return null;

  const recent = monthly.slice(-12);
  const max = Math.max(...recent.map((entry) => entry.amount));

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Proventos por mês
      </h2>
      <p className="micro-hint">
        Cada barrinha é um mês. É assim que a renda passiva se constrói: devagar
        e sem parar.
      </p>

      <ul className="mt-6 flex h-44 items-end gap-1.5 sm:gap-2.5">
        {recent.map((entry) => (
          <li
            key={entry.month}
            // `h-full` não é enfeite: a altura da barra é percentual, e sem uma
            // altura definida no pai ela resolve pra zero. O gráfico inteiro
            // ficava invisível — só os rótulos dos meses apareciam.
            className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
            title={`${label(entry.month)}: ${formatBRL(entry.amount)}`}
          >
            <span className="num text-[0.6rem] font-bold text-primary-deep opacity-0 transition-opacity group-hover:opacity-100 sm:text-xs">
              {formatBRL(entry.amount)}
            </span>
            <span
              className="w-full rounded-t-lg bg-primary-surface transition-colors group-hover:bg-primary-surface-deep"
              style={{
                height: `${max > 0 ? Math.max(4, (entry.amount / max) * 100) : 4}%`,
              }}
            />
            <span className="text-[0.65rem] font-bold text-muted-foreground sm:text-xs">
              {label(entry.month)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
