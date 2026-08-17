import { formatBRL } from '@/lib/format';
import { saveIncomeGoal, clearIncomeGoal } from '@/app/resumo/actions';

/**
 * Meta de renda passiva, medida contra a carteira que ela TEM.
 *
 * A calculadora de `/calculadoras` faz a mesma conta com número inventado; a
 * diferença aqui é que o rendimento sai da carteira real dela. Dizer "faltam
 * R$ 180 mil" usando o yield médio do mercado seria chute — usando o dela, é
 * uma resposta.
 */

interface IncomeGoalCardProps {
  /** R$/mês que ela quer receber. Nulo enquanto não definir. */
  goal: number | null;
  /** O que a carteira de hoje rende por mês, dos últimos 12 meses de pagamento. */
  monthlyIncome: number;
  /** Valor de mercado da carteira hoje. */
  portfolioValue: number;
}

export function IncomeGoalCard({
  goal,
  monthlyIncome,
  portfolioValue,
}: IncomeGoalCardProps) {
  if (goal === null) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">Meta de renda mensal</h2>
        <p className="micro-hint">
          Defina o valor mensal que pretende receber em proventos. O quanto
          falta é calculado com o rendimento efetivo da sua carteira, não com
          uma média de mercado.
        </p>
        <form action={saveIncomeGoal} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-bold">Valor mensal desejado</span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-panel px-4 focus-within:border-primary">
              <span className="text-sm font-bold text-muted-foreground">R$</span>
              {/* `step` fica em "any" de propósito: com `min="1"` e `step="100"`
                  os valores válidos seriam 1, 101, 201… e 2000 era recusado pela
                  validação do browser. O submit falhava calado — `requestSubmit`
                  nem chega a disparar o evento quando o campo é inválido. */}
              <input
                name="goal"
                type="number"
                min="1"
                step="any"
                inputMode="decimal"
                defaultValue={2000}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
            </span>
          </label>
          <button type="submit" className="btn-primary">
            Definir
          </button>
        </form>
      </section>
    );
  }

  const progress = goal > 0 ? Math.min(1, monthlyIncome / goal) : 0;
  const reached = monthlyIncome >= goal;

  // O yield da carteira DELA, não uma média de mercado. Sem carteira ou sem
  // provento não dá pra projetar, e a tela diz isso em vez de chutar 8%.
  const yearlyYield =
    portfolioValue > 0 && monthlyIncome > 0 ? (monthlyIncome * 12) / portfolioValue : null;
  const neededPortfolio = yearlyYield === null ? null : (goal * 12) / yearlyYield;
  const missing =
    neededPortfolio === null ? null : Math.max(0, neededPortfolio - portfolioValue);

  return (
    <section className="card-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight">Meta de renda mensal</h2>
        <form action={clearIncomeGoal}>
          <button type="submit" className="text-xs font-bold text-muted-foreground hover:text-primary">
            Mudar meta
          </button>
        </form>
      </div>

      <p className="micro-hint">
        Você quer receber {formatBRL(goal)} por mês. Hoje a carteira rende{' '}
        {formatBRL(monthlyIncome)}.
      </p>

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="num text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none text-primary-deep">
            {(progress * 100).toFixed(progress < 0.1 ? 1 : 0).replace('.', ',')}%
          </p>
          <p className="micro-hint">do caminho</p>
        </div>
        <div
          className="mt-3 h-3 w-full overflow-hidden rounded-full bg-panel"
          role="img"
          aria-label={`${Math.round(progress * 100)}% da meta`}
        >
          <div
            className="h-full rounded-full bg-primary-surface transition-[width]"
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>
      </div>

      <p className="mt-4 border-t border-border pt-4 text-sm font-semibold">
        {reached ? (
          <>
            <strong className="text-positive">Meta atingida</strong>. A renda
            projetada da carteira atual já cobre o valor definido, sem
            necessidade de venda de ativos.
          </>
        ) : missing === null ? (
          <span className="text-muted-foreground">
            O cálculo do quanto falta é feito assim que os ativos em carteira
            registrarem distribuições.
          </span>
        ) : (
          <>
            No rendimento atual da carteira (
            {((yearlyYield ?? 0) * 100).toFixed(1).replace('.', ',')}% ao ano),
            faltam{' '}
            <strong className="text-primary-deep">{formatBRL(missing)}</strong> de
            patrimônio para alcançar {formatBRL(goal)} por mês.
          </>
        )}
      </p>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        A conta usa o que teus ativos pagaram nos últimos 12 meses. Se eles
        pagarem mais, você chega antes; se pagarem menos, demora mais.
      </p>
    </section>
  );
}
