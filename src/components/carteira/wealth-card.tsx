import Link from 'next/link';
import { formatBRL, formatPercent } from '@/lib/format';
import type { PortfolioSummary } from '@/types/portfolio';

interface WealthCardProps {
  summary: PortfolioSummary;
  dayChangePercent: number | null;
  /** Líquido de IR retido — o mesmo número que a tela de proventos exibe. */
  totalReceived: number;
  /**
   * Renda fixa resgatável hoje, líquida de IR. Entra no total porque
   * "patrimônio" é quanto a pessoa tem, e um CDB de R$ 50 mil fora da conta
   * transformaria o número em mentira.
   */
  fixedIncomeNet: number;
}

export function WealthCard({
  summary,
  dayChangePercent,
  totalReceived,
  fixedIncomeNet,
}: WealthCardProps) {
  const { totalValue, investedValue, profit, profitPercent } = summary;
  const isUp = profit >= 0;
  const hasFixedIncome = fixedIncomeNet > 0;
  const grandTotal = totalValue + fixedIncomeNet;

  return (
    <section className="card-lg">
      <p className="micro-label">Patrimônio</p>
      <p className="micro-hint">
        {hasFixedIncome
          ? 'renda variável na cotação atual, mais a renda fixa resgatável hoje'
          : 'valor de mercado das posições na cotação atual'}
      </p>

      <div className="mt-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
        <strong className="num text-[clamp(2.3rem,9vw,3.2rem)] font-extrabold leading-none tracking-tight">
          {formatBRL(grandTotal)}
        </strong>
        {dayChangePercent !== null && (
          // A variação do dia é só da renda variável, e o rótulo diz isso
          // quando há renda fixa junto: CDB não oscila no dia, e diluir a
          // variação no total faria o número parecer menor do que o mercado
          // realmente andou.
          <span className={`chip ${dayChangePercent >= 0 ? 'chip-up' : 'chip-down'}`}>
            {dayChangePercent >= 0 ? '↑' : '↓'} {formatPercent(dayChangePercent)}{' '}
            {hasFixedIncome ? 'hoje em bolsa' : 'hoje'}
          </span>
        )}
      </div>

      {hasFixedIncome && (
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="micro-hint">em bolsa</dt>
            <dd className="num font-bold">{formatBRL(totalValue)}</dd>
          </div>
          <div>
            <dt className="micro-hint">em renda fixa</dt>
            <dd className="num font-bold">{formatBRL(fixedIncomeNet)}</dd>
          </div>
        </dl>
      )}

      {summary.hasMissingQuotes && (
        <p className="mt-3 rounded-panel bg-accent px-3.5 py-2.5 text-sm font-medium text-accent-text">
          Cotações parcialmente indisponíveis. O total considera apenas as
          posições com preço disponível no momento.
        </p>
      )}

      <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
        <div>
          <dt className="micro-hint">resultado não realizado sobre o custo de aquisição</dt>
          <dd
            className={`num mt-1 text-xl font-extrabold ${
              isUp ? 'text-positive' : 'text-negative'
            }`}
          >
            {isUp ? '+' : ''}
            {formatBRL(profit)}
            {profitPercent !== null && (
              <span className="ml-2 text-base font-bold">
                ({formatPercent(profitPercent)})
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="micro-hint">total investido</dt>
          <dd className="num mt-1 text-xl font-extrabold text-foreground">
            {formatBRL(investedValue)}
          </dd>
        </div>
      </dl>

      {totalReceived > 0 && (
        <Link
          href="/proventos"
          className="mt-5 flex items-center justify-between gap-3 rounded-panel bg-primary-wash px-4 py-3.5 transition-colors hover:bg-primary-tint"
        >
          <span>
            <span className="micro-hint block">
              proventos recebidos
            </span>
            <span className="num text-xl font-extrabold text-primary-deep">
              {formatBRL(totalReceived)}
            </span>
          </span>
          <span className="text-sm font-bold text-primary-deep">detalhar →</span>
        </Link>
      )}
    </section>
  );
}
