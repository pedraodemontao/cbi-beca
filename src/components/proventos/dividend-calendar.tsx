import Link from 'next/link';
import { formatBRL } from '@/lib/format';
import type { CalendarMonth } from '@/lib/dividends';

/**
 * O que ainda vai pingar, mês a mês.
 *
 * Não é uma grade de dias de propósito: provento é esparso — três, quatro no
 * mês inteiro — e uma grade de 31 quadradinhos vazios no celular não responde a
 * pergunta que a usuária faz, que é "quanto cai em setembro".
 */

interface DividendCalendarProps {
  months: CalendarMonth[];
}

export function DividendCalendar({ months }: DividendCalendarProps) {
  if (months.length === 0) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">
          O que já está marcado pra cair
        </h2>
        <p className="micro-hint mt-1">
          Nenhum dos teus ativos anunciou pagamento com data ainda. Assim que
          anunciarem, aparece aqui antes de cair na conta.
        </p>
      </section>
    );
  }

  const total = months.reduce((sum, month) => sum + month.total, 0);

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        O que já está marcado pra cair
      </h2>
      <p className="micro-hint">
        Isso não é projeção: são pagamentos que as empresas já anunciaram, com
        data. Some {formatBRL(total)} nos próximos meses.
      </p>

      <ol className="mt-5 flex flex-col gap-3">
        {months.map((month) => (
          <li key={month.month} className="rounded-panel border border-border bg-panel">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
              <p className="text-sm font-extrabold uppercase tracking-wide">
                {monthLabel(month.month)}
              </p>
              <p className="num text-lg font-extrabold text-primary">
                {formatBRL(month.total)}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-border">
              {month.payments.map((payment) => (
                <li
                  key={`${payment.ticker}-${payment.exDate}-${payment.type}-${payment.valuePerShare}`}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/ativo/${payment.ticker}`}
                      className="text-sm font-extrabold text-primary-deep hover:underline"
                    >
                      {payment.ticker}
                    </Link>
                    <span className="ml-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {payment.type}
                    </span>
                    <p className="text-xs font-medium text-muted-foreground">
                      dia {dayLabel(payment.paymentDate)} ·{' '}
                      {formatBRL(payment.valuePerShare)} ×{' '}
                      {payment.quantity.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <p className="num text-sm font-extrabold">{formatBRL(payment.amount)}</p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="micro-hint mt-4 border-t border-border pt-3">
        A conta usa a data-com — quem já tinha o ativo antes dela recebe, mesmo
        que o dinheiro caia semanas depois. Comprar hoje não dá direito a
        provento cuja data-com já passou.
      </p>
    </section>
  );
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-');
  const name = MONTHS[Number(monthNumber) - 1] ?? month;
  const currentYear = new Date().getFullYear();
  // O ano só aparece quando não é este — "setembro" basta pra quem está em 2026.
  return Number(year) === currentYear ? name : `${name} de ${year}`;
}

function dayLabel(date: string): string {
  return String(Number(date.slice(8, 10)));
}
