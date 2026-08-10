'use client';

import { useActionState, useState } from 'react';
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
  /** A Beca: pode publicar o ajuste valendo pra todas as usuárias. */
  isCurator: boolean;
  onDone: () => void;
}

export function OverrideForm({
  asset,
  override,
  reportedEps,
  defaultPayoutPercent,
  isCurator,
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

  // A Beca publica por padrão — o ajuste dela existe pra chegar na galera. Só
  // começa em "só pra mim" quando já tem um ajuste pessoal salvo nessa linha.
  const [scope, setScope] = useState<'personal' | 'global'>(() =>
    isCurator && !(override && !override.isGlobal) ? 'global' : 'personal'
  );
  const isPublishing = isCurator && scope === 'global';

  const savedPayoutPercent =
    override?.payout != null ? Math.round(override.payout * 100) : defaultPayoutPercent;

  const canClear = isPublishing
    ? Boolean(override?.hasGlobal)
    : Boolean(override && !override.isGlobal);

  return (
    <div className="flex flex-col gap-4 rounded-panel bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-extrabold tracking-tight">
          {isPublishing ? `Ajuste pra ${asset.ticker}` : `Teu ajuste pra ${asset.ticker}`}
        </h3>
        <button type="button" onClick={onDone} className="btn-ghost">
          Fechar
        </button>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="ticker" value={asset.ticker} />
        <input type="hidden" name="scope" value={scope} />

        {isCurator && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-bold">Quem vê esse ajuste</legend>
            <div className="flex flex-wrap gap-2">
              <ScopeOption
                label="Todo mundo"
                hint="vale pra todas as usuárias"
                checked={scope === 'global'}
                onSelect={() => setScope('global')}
              />
              <ScopeOption
                label="Só pra mim"
                hint="ninguém mais vê"
                checked={scope === 'personal'}
                onSelect={() => setScope('personal')}
              />
            </div>
          </fieldset>
        )}

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

        {isPublishing && (
          <p className="micro-hint">
            Salvando assim, esse é o preço teto que <strong>todas as usuárias</strong>{' '}
            enxergam em {asset.ticker}, com o selo “ajuste da Beca”. Quem já mexeu no
            próprio ajuste dessa empresa continua vendo o dela.
          </p>
        )}

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
            {isPending ? 'Salvando…' : isPublishing ? 'Publicar pra todo mundo' : 'Salvar ajuste'}
          </button>

          {canClear && (
            // `formAction` no botão em vez de um segundo <form>: form aninhado
            // é HTML inválido e o React descarta o de dentro. O `scope` que vai
            // junto é o mesmo hidden do formulário, então o botão apaga
            // exatamente o ajuste que está sendo editado.
            <button type="submit" formAction={clearCeilingOverride} className="btn-ghost">
              {isPublishing ? 'Despublicar' : 'Voltar ao padrão'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

interface ScopeOptionProps {
  label: string;
  hint: string;
  checked: boolean;
  onSelect: () => void;
}

/** Radio desenhado como chip — o alvo de toque é a caixa inteira, não o círculo. */
function ScopeOption({ label, hint, checked, onSelect }: ScopeOptionProps) {
  return (
    <label
      className={`flex cursor-pointer flex-col rounded-panel border px-4 py-2.5 ${
        checked ? 'border-primary bg-primary-wash' : 'border-border bg-surface'
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name="scopeChoice"
          checked={checked}
          onChange={onSelect}
          className="accent-primary"
        />
        <span className="text-sm font-bold">{label}</span>
      </span>
      <span className="pl-6 text-xs font-medium text-muted-foreground">{hint}</span>
    </label>
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
