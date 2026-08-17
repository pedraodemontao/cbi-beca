import { formatBRL } from '@/lib/format';
import type { DividendIncomeReport } from '@/types/portfolio';

interface IncomeSummaryProps {
  report: DividendIncomeReport;
}

export function IncomeSummary({ report }: IncomeSummaryProps) {
  const hasIncome = report.totalReceived > 0;

  return (
    <section className="card-lg">
      <p className="micro-label">Total recebido</p>
      <p className="micro-hint">
        Proventos creditados pelos ativos em carteira desde a data de
        aquisição, líquidos de imposto retido na fonte.
      </p>

      {/* O destaque é o LÍQUIDO. Enquanto era o bruto, o número contradizia o
          bloco de imposto logo abaixo, que afirma — corretamente — que o IR já
          saiu antes do crédito. */}
      <p className="num mt-3.5 text-[clamp(2.3rem,9vw,3.2rem)] font-extrabold leading-none text-primary-deep">
        {formatBRL(report.netReceived)}
      </p>

      {hasIncome ? (
        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <div>
            <dt className="micro-hint">Média mensal recebida</dt>
            <dd className="num mt-1 text-xl font-extrabold">
              {formatBRL(report.monthlyAverage)}
            </dd>
          </div>
          <div>
            <dt className="micro-hint">
              Renda mensal projetada da carteira atual
            </dt>
            <dd className="num mt-1 text-xl font-extrabold text-primary-deep">
              {formatBRL(report.estimatedMonthlyIncome)}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-5 rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
          Nenhum pagamento localizado para os ativos em carteira. Os ativos
          podem não ter distribuído proventos desde a data de aquisição ou não
          distribuir proventos.
        </p>
      )}

      {report.jcpReceived > 0 && (
        <div className="mt-4 rounded-panel border border-border bg-panel px-4 py-3">
          <p className="text-sm font-bold">Imposto retido na fonte</p>
          <p className="micro-hint mt-1">
            O total bruto distribuído foi de{' '}
            <strong className="font-bold text-foreground">
              {formatBRL(report.totalReceived)}
            </strong>
            , dos quais {formatBRL(report.jcpReceived)} como JCP (juros sobre
            capital próprio), sujeito a 15% de imposto de renda retido na fonte
            — dividendos são isentos. Foram retidos{' '}
            <strong className="font-bold text-foreground">
              {formatBRL(report.taxWithheld)}
            </strong>
            , já descontados no valor acima. Não há recolhimento adicional a
            fazer.
          </p>
        </div>
      )}

      {report.hasMissingPurchaseDates && (
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-xs font-medium text-muted-foreground">
          Há ativos sem data de aquisição informada. Para esses, o cálculo
          considera a data de cadastro, o que pode subestimar o total.
        </p>
      )}

      {/* Zero aqui não é "não pagou" — é dado que a plataforma não tem. Sem
          esta frase, quem cadastra AAPL34 conclui que a Apple não distribui. */}
      {report.tickersWithoutDividendData.length > 0 && (
        <p className="mt-3 rounded-panel bg-background px-4 py-3 text-xs font-medium text-muted-foreground">
          {report.tickersWithoutDividendData.join(', ')}{' '}
          {report.tickersWithoutDividendData.length === 1
            ? 'é um BDR e ficou'
            : 'são BDRs e ficaram'}{' '}
          de fora desta conta: não temos o histórico de proventos de empresa
          estrangeira. Isso não significa que{' '}
          {report.tickersWithoutDividendData.length === 1 ? 'ele' : 'eles'} não
          {' '}paguem — o recibo repassa o que a empresa distribui lá fora.
        </p>
      )}
    </section>
  );
}
