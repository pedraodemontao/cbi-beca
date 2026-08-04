'use client';

import { useActionState } from 'react';
import {
  saveCeilingOverride,
  clearCeilingOverride,
  type CeilingOverrideActionState,
} from '@/app/preco-teto/actions';
import { formatBRL } from '@/lib/format';
import type { AppliedOverride, CeilingAsset } from '@/types/ceiling';

const initialState: CeilingOverrideActionState = { error: null };

interface OverrideFormProps {
  asset: CeilingAsset;
  override: AppliedOverride | undefined;
  /** LPA do balanço, pra mostrar do que a usuária está discordando. */
  reportedEps: number | null;
  /** Payout do slider, usado como ponto de partida quando não há ajuste salvo. */
  defaultPayoutPercent: number;
  onDone: () => void;
}

export function OverrideForm({
  asset,
  override,
  reportedEps,
  defaultPayoutPercent,
  onDone,
}: OverrideFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: CeilingOverrideActionState, formData: FormData) => {
      const result = await saveCeilingOverride(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  const savedPayoutPercent =
    override?.payout != null ? Math.round(override.payout * 100) : defaultPayoutPercent;

  return (
    <div className="flex flex-col gap-4 rounded-panel bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-extrabold tracking-tight">
          Teu ajuste pra {asset.ticker}
        </h3>
        <button type="button" onClick={onDone} className="btn-ghost">
          Fechar
        </button>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="ticker" value={asset.ticker} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Payout só dessa empresa</span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
              <input
                name="payoutPercent"
                type="number"
                min="1"
                max="200"
                step="1"
                inputMode="numeric"
                required
                defaultValue={savedPayoutPercent}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
              <span className="text-sm font-bold text-muted-foreground">%</span>
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">
              Lucro por ação que você espera{' '}
              <span className="font-medium text-muted-foreground">(opcional)</span>
            </span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
              <span className="text-sm font-bold text-muted-foreground">R$</span>
              <input
                name="expectedEps"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                defaultValue={savedEps(override, asset) ?? ''}
                placeholder={reportedEps === null ? '' : reportedEps.toFixed(2)}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
            </span>
          </label>
        </div>

        <p className="micro-hint">
          {reportedEps === null ? (
            <>Sem o lucro do balanço eu não consigo projetar sozinha — o que você digitar aqui vira a base da conta.</>
          ) : (
            <>
              O balanço mais recente dá {formatBRL(reportedEps)} de lucro por ação.
              Se você acha que esse número não se repete — teve venda de ativo, um
              trimestre fora da curva — põe aqui o que você espera pra frente. Deixa
              vazio pra usar o balanço.
            </>
          )}
        </p>

        {state.error && (
          <p className="text-sm font-semibold text-negative">{state.error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Salvando…' : 'Salvar ajuste'}
          </button>

          {override && !override.isGlobal && (
            // `formAction` no botão em vez de um segundo <form>: form aninhado
            // é HTML inválido e o React descarta o de dentro.
            <button type="submit" formAction={clearCeilingOverride} className="btn-ghost">
              Voltar ao padrão
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

/** O banco guarda lucro total; o formulário fala em lucro por ação. */
function savedEps(
  override: AppliedOverride | undefined,
  asset: CeilingAsset
): number | undefined {
  if (!override?.manualProfit || !asset.sharesOutstanding) return undefined;
  return Number((override.manualProfit / asset.sharesOutstanding).toFixed(2));
}
