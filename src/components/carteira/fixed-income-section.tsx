'use client';

import { useActionState, useState } from 'react';
import {
  addFixedIncome,
  updateFixedIncome,
  deleteFixedIncome,
  type FixedIncomeActionState,
} from '@/app/carteira/fixed-income-actions';
import { formatBRL, formatPercent } from '@/lib/format';
import { KIND_LABEL, isTaxExempt } from '@/lib/fixed-income';
import type { FixedIncomeHolding, FixedIncomeSummary } from '@/types/fixed-income';

const initialState: FixedIncomeActionState = { error: null };

interface FixedIncomeSectionProps {
  summary: FixedIncomeSummary;
}

export function FixedIncomeSection({ summary }: FixedIncomeSectionProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { holdings, totalPrincipal, totalNet, hasIncomplete } = summary;
  const totalYield = totalNet - totalPrincipal;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">Renda fixa</h2>
          <p className="micro-hint">
            CDB, LCI, LCA e afins. O rendimento é calculado pela taxa
            contratada — você não digita quanto rendeu.
          </p>
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="btn-ghost flex-none"
          >
            + Adicionar aplicação
          </button>
        )}
      </div>

      {holdings.length > 0 && (
        <div className="card-lg">
          <p className="micro-label">Resgatando hoje</p>
          <p className="micro-hint">já descontado o imposto de renda</p>
          <p className="num mt-2 text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none tracking-tight">
            {formatBRL(totalNet)}
          </p>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="micro-hint">total aplicado</dt>
              <dd className="num font-bold">{formatBRL(totalPrincipal)}</dd>
            </div>
            <div>
              <dt className="micro-hint">rendimento líquido</dt>
              <dd
                className={`num font-bold ${
                  totalYield >= 0 ? 'text-positive-deep' : 'text-negative-deep'
                }`}
              >
                {totalYield >= 0 ? '+' : ''}
                {formatBRL(totalYield)}
              </dd>
            </div>
          </dl>
          {hasIncomplete && (
            <p className="micro-hint mt-3">
              Alguma aplicação ficou sem cálculo porque a série do Banco
              Central não respondeu. Ela entra no total pelo valor aplicado, e
              o rendimento dela não está somado aqui.
            </p>
          )}
        </div>
      )}

      {isAdding && (
        <FixedIncomeForm
          action={addFixedIncome}
          onDone={() => setIsAdding(false)}
          submitLabel="Salvar aplicação"
        />
      )}

      {holdings.map((holding) =>
        editingId === holding.id ? (
          <FixedIncomeForm
            key={holding.id}
            holding={holding}
            action={updateFixedIncome}
            onDone={() => setEditingId(null)}
            submitLabel="Salvar alterações"
          />
        ) : (
          <FixedIncomeCard
            key={holding.id}
            holding={holding}
            onEdit={() => setEditingId(holding.id)}
          />
        )
      )}

      {holdings.length === 0 && !isAdding && (
        <p className="micro-hint">
          Nenhuma aplicação cadastrada. O valor de hoje é calculado a partir do
          CDI publicado pelo Banco Central, não de uma estimativa.
        </p>
      )}
    </section>
  );
}

function FixedIncomeCard({
  holding,
  onEdit,
}: {
  holding: FixedIncomeHolding;
  onEdit: () => void;
}) {
  const { valuation } = holding;
  const taxa =
    holding.indexKind === 'cdi'
      ? `${formatNumber(holding.indexPercent)}% do CDI`
      : `${formatNumber(holding.ratePercent)}% ao ano`;

  return (
    <article className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold tracking-tight">{holding.name}</h3>
          <p className="micro-hint">
            {KIND_LABEL[holding.kind]} · {taxa}
            {isTaxExempt(holding.kind) && ' · isento de IR'}
          </p>
        </div>
        <span className="flex flex-none gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-full px-3 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary-wash hover:text-primary-deep"
          >
            Editar
          </button>
          <form action={deleteFixedIncome}>
            <input type="hidden" name="id" value={holding.id} />
            <button
              type="submit"
              className="rounded-full px-3 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-negative-tint hover:text-negative-deep"
            >
              Remover
            </button>
          </form>
        </span>
      </div>

      {valuation === null ? (
        <p className="micro-hint mt-3">
          Não foi possível calcular agora — a série do Banco Central não
          respondeu. Você aplicou {formatBRL(holding.principal)}.
        </p>
      ) : (
        <>
          <p className="num mt-3 text-2xl font-extrabold leading-none tracking-tight">
            {formatBRL(valuation.netValue)}
          </p>
          <p className="micro-hint">líquido, resgatando hoje</p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <Field label="Aplicado" value={formatBRL(holding.principal)} />
            <Field label="Valor bruto" value={formatBRL(valuation.grossValue)} />
            <Field
              label="Rendeu"
              value={`${valuation.grossYield >= 0 ? '+' : ''}${formatBRL(valuation.grossYield)}`}
              tone={valuation.grossYield >= 0 ? 'up' : 'down'}
            />
            <Field
              label={valuation.taxRate === 0 ? 'Imposto' : `IR ${formatPercent(valuation.taxRate * 100)}`}
              value={valuation.taxRate === 0 ? 'isento' : `−${formatBRL(valuation.taxDue)}`}
            />
          </dl>

          <p className="micro-hint mt-3">
            {valuation.isMatured ? (
              <>
                Venceu em {formatDay(holding.maturesOn)} e parou de render. O
                valor acima é o do vencimento.
              </>
            ) : holding.maturesOn === null ? (
              <>Sem data de vencimento — liquidez diária.</>
            ) : (
              <>
                Vence em {formatDay(holding.maturesOn)}, daqui a{' '}
                {valuation.daysToMaturity} dias. Faltando{' '}
                {diasParaProximaFaixa(valuation.elapsedDays)}
              </>
            )}
          </p>
        </>
      )}
    </article>
  );
}

/**
 * Quanto falta para o IR cair de faixa.
 *
 * É o número que muda decisão de resgate, e nenhuma corretora mostra: sacar
 * três dias antes de completar 721 pode custar 2,5 pontos de imposto sobre
 * todo o rendimento.
 */
function diasParaProximaFaixa(elapsedDays: number): string {
  const limites = [
    { dia: 180, proxima: '20%' },
    { dia: 360, proxima: '17,5%' },
    { dia: 720, proxima: '15%' },
  ];
  const alvo = limites.find((item) => elapsedDays <= item.dia);
  if (!alvo) return 'o IR já está na menor faixa, 15%.';
  return `${alvo.dia - elapsedDays + 1} dias para o IR cair para ${alvo.proxima}.`;
}

function Field({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'up' | 'down';
}) {
  return (
    <div>
      <dt className="micro-hint">{label}</dt>
      <dd
        className={`num font-bold ${
          tone === 'up'
            ? 'text-positive-deep'
            : tone === 'down'
              ? 'text-negative-deep'
              : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function FixedIncomeForm({
  holding,
  action,
  onDone,
  submitLabel,
}: {
  holding?: FixedIncomeHolding;
  action: (
    prev: FixedIncomeActionState,
    formData: FormData
  ) => Promise<FixedIncomeActionState>;
  onDone: () => void;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(
    async (prev: FixedIncomeActionState, formData: FormData) => {
      const result = await action(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  // Qual campo de taxa aparece depende do indexador, e isso é estado porque a
  // troca precisa ser imediata: deixar os dois na tela convida a preencher o
  // errado, e o banco recusa a combinação.
  const [indexKind, setIndexKind] = useState<'cdi' | 'prefixado'>(
    holding?.indexKind ?? 'cdi'
  );

  return (
    <form action={formAction} className="card-lg flex flex-col gap-4">
      {holding && <input type="hidden" name="id" value={holding.id} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Nome</span>
          <input
            name="name"
            type="text"
            required
            maxLength={80}
            placeholder="CDB Banco Inter"
            defaultValue={holding?.name}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Tipo</span>
          <select name="kind" defaultValue={holding?.kind ?? 'cdb'} className="field">
            {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((key) => (
              <option key={key} value={key}>
                {KIND_LABEL[key]}
                {isTaxExempt(key) ? ' — isento de IR' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Valor aplicado</span>
          <span className="flex items-center gap-2 rounded-panel border border-border bg-panel px-4 focus-within:border-primary">
            <span className="text-sm font-bold text-muted-foreground">R$</span>
            <input
              name="principal"
              type="number"
              min="0"
              // `step="any"`: valor com centavo quebrado é comum, e step
              // restritivo barra o submit em silêncio.
              step="any"
              inputMode="decimal"
              required
              defaultValue={holding?.principal}
              className="num w-full bg-transparent py-3 text-base outline-none"
            />
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Data da aplicação</span>
          <input
            name="appliedOn"
            type="date"
            required
            defaultValue={holding?.appliedOn}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Indexador
          </span>
          <select
            name="indexKind"
            value={indexKind}
            onChange={(event) =>
              setIndexKind(event.target.value as 'cdi' | 'prefixado')
            }
            className="field"
          >
            <option value="cdi">% do CDI (pós-fixado)</option>
            <option value="prefixado">Taxa fixa ao ano (prefixado)</option>
          </select>
        </label>

        {indexKind === 'cdi' ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Percentual do CDI</span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-panel px-4 focus-within:border-primary">
              <input
                name="indexPercent"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                required
                placeholder="110"
                defaultValue={holding?.indexPercent ?? ''}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
              <span className="text-sm font-bold text-muted-foreground">%</span>
            </span>
          </label>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">Taxa ao ano</span>
            <span className="flex items-center gap-2 rounded-panel border border-border bg-panel px-4 focus-within:border-primary">
              <input
                name="ratePercent"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                required
                placeholder="12,5"
                defaultValue={holding?.ratePercent ?? ''}
                className="num w-full bg-transparent py-3 text-base outline-none"
              />
              <span className="text-sm font-bold text-muted-foreground">% a.a.</span>
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Vencimento{' '}
            <span className="font-medium text-muted-foreground">
              (deixe vazio se tem liquidez diária)
            </span>
          </span>
          <input
            name="maturesOn"
            type="date"
            defaultValue={holding?.maturesOn ?? ''}
            className="field"
          />
        </label>
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-negative">{state.error}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'Salvando…' : submitLabel}
        </button>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>
    </form>
  );
}

function formatNumber(value: number | null): string {
  if (value === null) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/** Data pura fatiada, nunca `new Date(string)` — ver `fixed-income-data.ts`. */
function formatDay(day: string | null): string {
  if (!day) return '—';
  const [year, month, date] = day.split('-');
  return `${date}/${month}/${year}`;
}
