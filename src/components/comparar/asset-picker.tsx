'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MAX_COMPARED } from '@/lib/comparison';
import type { ComparableOption } from '@/lib/ceiling-data';

interface AssetPickerProps {
  options: ComparableOption[];
  selected: string[];
}

/**
 * Escolha dos ativos comparados.
 *
 * A seleção vive na URL (`?ativos=PETR4,VALE3`), não em estado do componente.
 * Duas razões: o servidor passa a buscar SÓ os dois a quatro tickers escolhidos
 * — contra os ~690 que `/preco-teto` embarca por pageview —, e a comparação
 * montada vira um link que a usuária consegue mandar pra alguém.
 */
export function AssetPicker({ options, selected }: AssetPickerProps) {
  const router = useRouter();
  const listId = useId();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byTicker = useMemo(
    () => new Map(options.map((option) => [option.ticker, option])),
    [options]
  );

  function apply(next: string[]) {
    setError(null);
    startTransition(() => {
      const query = next.length > 0 ? `?ativos=${next.join(',')}` : '';
      router.replace(`/comparar${query}`, { scroll: false });
    });
  }

  function add() {
    const ticker = draft.trim().toUpperCase();
    if (!ticker) return;

    // Ticker desconhecido é barrado aqui: aceitar produziria uma coluna vazia,
    // que a usuária leria como "esse ativo não tem dado" em vez de "esse código
    // não existe".
    if (!byTicker.has(ticker)) {
      setError(`${ticker} não está no catálogo.`);
      return;
    }
    if (selected.includes(ticker)) {
      setError(`${ticker} já está na comparação.`);
      return;
    }
    if (selected.length >= MAX_COMPARED) {
      setError(`A comparação vai até ${MAX_COMPARED} ativos.`);
      return;
    }

    setDraft('');
    apply([...selected, ticker]);
  }

  const isFull = selected.length >= MAX_COMPARED;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">Ativos comparados</h2>
      <p className="micro-hint">
        Escolha de 2 a {MAX_COMPARED} ações ou fundos. Os números saem do
        catálogo — não há nada para preencher à mão.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-2">
        <label className="flex min-w-48 flex-1 flex-col gap-1.5">
          <span className="text-sm font-bold">Código do ativo</span>
          <input
            list={listId}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              // O seletor vive fora de qualquer <form>, então o Enter não tem
              // submit pra disparar — precisa chamar a adição na mão.
              event.preventDefault();
              add();
            }}
            placeholder="PETR4"
            autoComplete="off"
            disabled={isFull}
            aria-describedby={error ? `${listId}-erro` : undefined}
            className="field num uppercase disabled:opacity-60"
          />
          <datalist id={listId}>
            {options.map((option) => (
              <option key={option.ticker} value={option.ticker}>
                {option.name}
              </option>
            ))}
          </datalist>
        </label>
        <button
          type="button"
          onClick={add}
          disabled={isFull || isPending}
          className="btn-primary disabled:opacity-60"
        >
          Adicionar
        </button>
      </div>

      {error && (
        <p
          id={`${listId}-erro`}
          role="status"
          className="mt-2 text-sm font-semibold text-negative-deep"
        >
          {error}
        </p>
      )}

      {isFull && !error && (
        <p className="micro-hint mt-2">
          Limite de {MAX_COMPARED} atingido. Remova um ativo para trocar.
        </p>
      )}

      {selected.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {selected.map((ticker) => (
            <li key={ticker}>
              <button
                type="button"
                onClick={() => apply(selected.filter((item) => item !== ticker))}
                disabled={isPending}
                className="chip chip-neutral transition-colors hover:text-negative-deep"
                aria-label={`Remover ${ticker} da comparação`}
              >
                <span className="num">{ticker}</span>
                <span aria-hidden>✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
