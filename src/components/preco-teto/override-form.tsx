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

  const isFund = asset.assetType === 'fii';

  const savedPayoutPercent =
    override?.payout != null ? Math.round(override.payout * 100) : defaultPayoutPercent;

  /** O que o banco diz que o fundo distribuiu por mês — a base do palpite. */
  const reportedMonthly =
    asset.dividends12m === null ? null : asset.dividends12m / 12;

  const canClear = isPublishing
    ? Boolean(override?.hasGlobal)
    : Boolean(override && !override.isGlobal);

  return (
    <div className="flex flex-col gap-4 rounded-panel bg-background p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-extrabold tracking-tight">
          {isPublishing ? `Ajuste de ${asset.ticker}` : `Seu ajuste de ${asset.ticker}`}
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
            <legend className="text-sm font-bold">Alcance do ajuste</legend>
            <div className="flex flex-wrap gap-2">
              <ScopeOption
                label="Todas as contas"
                hint="publicado pela Beca"
                checked={scope === 'global'}
                onSelect={() => setScope('global')}
              />
              <ScopeOption
                label="Apenas esta conta"
                hint="visível só para você"
                checked={scope === 'personal'}
                onSelect={() => setScope('personal')}
              />
            </div>
          </fieldset>
        )}

        {isFund ? (
          // Fundo não apura lucro por cota, então payout e LPA não existem
          // aqui. Enquanto o formulário era um só, o botão "Ajustar" na aba
          // Fundos abria um campo pedindo "Lucro por ação esperado" — pergunta
          // sem resposta, e o `reportedEps` vinha nulo porque fundo não tem
          // `sharesOutstanding`. O ajuste nunca funcionou ali.
          <label className="flex max-w-xs flex-col gap-1.5">
            <span className="text-sm font-bold">Distribuição mensal por cota</span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
              <span className="text-sm font-bold text-muted-foreground">R$</span>
              <input
                name="monthlyDistribution"
                type="number"
                min="0"
                // `step="any"`: rendimento de cota barata tem mais casas que
                // dois, e `step` restritivo barra o submit em silêncio — o
                // defeito que a meta de renda já teve.
                step="any"
                inputMode="decimal"
                required
                defaultValue={savedMonthly(override) ?? ''}
                placeholder={reportedMonthly === null ? '' : reportedMonthly.toFixed(4)}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
            </span>
          </label>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Payout desta empresa</span>
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
                Lucro por ação esperado{' '}
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
        )}

        {isPublishing && (
          <p className="micro-hint">
            Ao salvar, este passa a ser o preço teto de {asset.ticker} exibido
            em <strong>todas as contas</strong>, com o selo “ajuste da Beca”.
            Contas que já definiram ajuste próprio para esta empresa mantêm o
            delas.
          </p>
        )}

        <p className="micro-hint">
          {isFund ? (
            reportedMonthly === null ? (
              <>
                Não temos o histórico de distribuição deste fundo. O valor
                informado aqui passa a ser a base do teto.
              </>
            ) : (
              <>
                As distribuições pagas nos últimos 12 meses dão{' '}
                {formatBRL(reportedMonthly)} por mês. Se esse valor não reflete
                a realidade atual do fundo, corrija aqui — o teto recalcula
                sobre o que você informar.
              </>
            )
          ) : reportedEps === null ? (
            <>Sem o lucro do balanço não há projeção automática: o valor informado aqui passa a ser a base do cálculo.</>
          ) : (
            <>
              O balanço mais recente registra {formatBRL(reportedEps)} de lucro
              por ação. Se esse resultado não deve se repetir — venda de ativo,
              trimestre atípico —, informe aqui o valor esperado. Em branco, o
              cálculo usa o balanço.
            </>
          )}
        </p>

        {state.error && (
          <p className="text-sm font-semibold text-negative">{state.error}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? 'Salvando…' : isPublishing ? 'Publicar para todas as contas' : 'Salvar ajuste'}
          </button>

          {canClear && (
            // `formAction` no botão em vez de um segundo <form>: form aninhado
            // é HTML inválido e o React descarta o de dentro. O `scope` que vai
            // junto é o mesmo hidden do formulário, então o botão apaga
            // exatamente o ajuste que está sendo editado.
            <button type="submit" formAction={clearCeilingOverride} className="btn-ghost">
              {isPublishing ? 'Despublicar' : 'Restaurar padrão'}
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

/** O banco guarda a distribuição ANUAL; o formulário fala em mensal. */
function savedMonthly(override: AppliedOverride | undefined): number | undefined {
  if (!override?.manualDividends12m) return undefined;
  return Number((override.manualDividends12m / 12).toFixed(6));
}

/** O banco guarda lucro total; o formulário fala em lucro por ação. */
function savedEps(
  override: AppliedOverride | undefined,
  asset: CeilingAsset
): number | undefined {
  if (!override?.manualProfit || !asset.sharesOutstanding) return undefined;
  return Number((override.manualProfit / asset.sharesOutstanding).toFixed(2));
}
