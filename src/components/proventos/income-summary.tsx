import { formatBRL } from '@/lib/format';
import type { DividendIncomeReport } from '@/types/portfolio';

interface IncomeSummaryProps {
  report: DividendIncomeReport;
}

export function IncomeSummary({ report }: IncomeSummaryProps) {
  const hasIncome = report.totalReceived > 0;

  return (
    <section className="card-lg">
      <p className="micro-label">Já pingou na tua conta</p>
      <p className="micro-hint">
        Tudo que teus ativos te pagaram desde que você comprou. Esse dinheiro é
        teu sem precisar vender nada.
      </p>

      <p className="num mt-3.5 text-[clamp(2.3rem,9vw,3.2rem)] font-extrabold leading-none text-primary-deep">
        {formatBRL(report.totalReceived)}
      </p>

      {hasIncome ? (
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="micro-hint">Média por mês até agora</dt>
            <dd className="num mt-1 text-xl font-extrabold">
              {formatBRL(report.monthlyAverage)}
            </dd>
          </div>
          <div>
            <dt className="micro-hint">
              Sua carteira de hoje rende, por mês, cerca de
            </dt>
            <dd className="num mt-1 text-xl font-extrabold text-primary-deep">
              {formatBRL(report.estimatedMonthlyIncome)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-5 rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
          Ainda não achei pagamentos pros teus ativos. Pode ser que eles ainda
          não tenham distribuído nada desde que você comprou — ou que sejam
          ativos que não pagam proventos.
        </p>
      )}

      {report.jcpReceived > 0 && (
        <div className="mt-4 rounded-panel border border-border bg-panel px-4 py-3">
          <p className="text-sm font-bold">Desse total, o imposto já saiu</p>
          <p className="micro-hint mt-1">
            {formatBRL(report.jcpReceived)} vieram como JCP (juros sobre capital
            próprio), que tem 15% de imposto retido na fonte — dividendo comum
            não tem. Foram{' '}
            <strong className="font-bold text-foreground">
              {formatBRL(report.taxWithheld)}
            </strong>{' '}
            de IR, já descontados antes de cair na tua conta. Você não precisa
            recolher nada nem declarar como imposto a pagar.
          </p>
        </div>
      )}

      {report.hasMissingPurchaseDates && (
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-xs font-medium text-muted-foreground">
          Alguns ativos estão sem a data de compra, então eu contei só a partir
          do dia em que você cadastrou. Preenchendo a data, esse número fica
          certinho.
        </p>
      )}
    </section>
  );
}
