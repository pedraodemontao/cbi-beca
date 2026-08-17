'use client';

import { useActionState } from 'react';
import { updatePosition, type PositionActionState } from '@/app/carteira/actions';
import type { PositionValuation } from '@/types/portfolio';

const initialState: PositionActionState = { error: null };

interface EditPositionFormProps {
  valuation: PositionValuation;
  purchaseDate: string | null;
  onDone: () => void;
}

export function EditPositionForm({
  valuation,
  purchaseDate,
  onDone,
}: EditPositionFormProps) {
  const [state, formAction, isPending] = useActionState(
    async (prev: PositionActionState, formData: FormData) => {
      const result = await updatePosition(prev, formData);
      if (result.success) onDone();
      return result;
    },
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={valuation.positionId} />
      <input type="hidden" name="ticker" value={valuation.ticker} />

      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-extrabold tracking-tight">
          Editar {valuation.ticker}
        </h3>
        <button type="button" onClick={onDone} className="btn-ghost">
          Cancelar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">É ação ou FII?</span>
          <select
            name="assetType"
            defaultValue={valuation.assetType}
            className="field"
          >
            <option value="stock">Ação</option>
            <option value="fii">FII (fundo imobiliário)</option>
            <option value="bdr">BDR (empresa de fora, negociada aqui)</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Quantas você tem?</span>
          <input
            name="quantity"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            required
            defaultValue={valuation.quantity}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Preço médio pago</span>
          <input
            name="avgPrice"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            required
            defaultValue={valuation.avgPrice}
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Data de aquisição{' '}
            <span className="font-medium text-muted-foreground">(opcional)</span>
          </span>
          <input
            name="purchaseDate"
            type="date"
            defaultValue={purchaseDate ?? ''}
            className="field"
          />
        </label>
      </div>

      {state.error && (
        <p className="text-sm font-semibold text-negative">{state.error}</p>
      )}

      <button type="submit" disabled={isPending} className="btn-primary self-start">
        {isPending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </form>
  );
}
