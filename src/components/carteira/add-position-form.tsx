'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { addPosition, type PositionActionState } from '@/app/carteira/actions';
import type { BrapiTickerMatch } from '@/lib/brapi';
import type { AssetType } from '@/types/portfolio';

const initialState: PositionActionState = { error: null };

/**
 * Formato de BDR: quatro letras, um 3, mais um dígito — AAPL34, MSFT34.
 *
 * É a REDE, não a fonte: medido em 2026-08-17, o `/tickers` da brapi devolve
 * `assetType: "bdr"` para AAPL34, então quem decide é o sinal dela. O formato
 * cobre o caso de a busca vir sem tipo, e não colide com o resto da B3 —
 * papel comum tem UM dígito (PETR4), unit e FII têm dois começando em 1
 * (KLBN11, MXRF11). O alerta do `AGENTS.md` sobre `[A-Z]{4}\d` perder a B3SA3
 * não se aplica: "B3SA" tem dígito no meio e nem casa com quatro letras.
 */
const BDR_TICKER = /^[A-Z]{4}3\d$/;

/**
 * A ORDEM é o que importa aqui, e ela já causou estrago.
 *
 * A brapi devolve `assetType: "fund"` tanto para ETF quanto para fundo
 * imobiliário, e o que separa os dois é o `subType` — "etf" contra "fii".
 * Enquanto o código casava 'fund' primeiro, todo ETF virava FII: em
 * 2026-08-17 havia quatro posições assim no banco (CHIP11, HASH11, ETHY11,
 * SPYI11), caindo no balde de fundo imobiliário na composição do resumo.
 *
 * Por isso os subtipos específicos vêm antes do genérico, e 'fund' sozinho é
 * o último recurso.
 */
function guessAssetType(symbol: string, brapiKind: string): AssetType {
  if (brapiKind.includes('crypto')) return 'crypto';
  if (brapiKind.includes('bdr')) return 'bdr';
  if (brapiKind.includes('etf')) return 'etf';
  if (brapiKind.includes('fii')) return 'fii';
  if (brapiKind.includes('fund')) return 'fii';
  if (BDR_TICKER.test(symbol)) return 'bdr';
  return 'stock';
}

export function AddPositionForm() {
  const formRef = useRef<HTMLFormElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [ticker, setTicker] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('stock');
  const [suggestions, setSuggestions] = useState<BrapiTickerMatch[]>([]);
  const [isListOpen, setIsListOpen] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (prev: PositionActionState, formData: FormData) => {
      const result = await addPosition(prev, formData);
      if (result.success) {
        formRef.current?.reset();
        setTicker('');
        setAssetType('stock');
        setSuggestions([]);
        setIsOpen(false);
      }
      return result;
    },
    initialState
  );

  useEffect(() => {
    if (!isListOpen || ticker.trim().length < 3) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tickers?q=${encodeURIComponent(ticker.trim())}`);
        if (!res.ok) return;
        const data = (await res.json()) as { matches: BrapiTickerMatch[] };
        setSuggestions((data.matches ?? []).slice(0, 6));
      } catch {
        // autocomplete é conveniência — falha silenciosa, usuária digita o ticker
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ticker, isListOpen]);

  function handlePick(match: BrapiTickerMatch) {
    const symbol = (match.ticker ?? match.symbol ?? '').toUpperCase();
    setTicker(symbol);
    // brapi devolve assetType 'fund' + subType 'fii' pra fundos imobiliários
    const kind = `${match.assetType ?? ''} ${match.subType ?? ''} ${match.type ?? ''}`.toLowerCase();
    setAssetType(guessAssetType(symbol, kind));
    setIsListOpen(false);
    setSuggestions([]);
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group flex w-full items-center justify-center gap-2.5 rounded-card border-2 border-dashed border-border bg-surface/50 px-6 py-6 text-center transition-colors hover:border-primary hover:bg-primary-wash"
      >
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full bg-primary-surface text-lg font-bold text-primary-surface-foreground"
        >
          +
        </span>
        <span className="text-base font-extrabold text-foreground">
          Adicionar ativo
        </span>
      </button>
    );
  }

  return (
    <section className="card-lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight">
            Adicionar ativo
          </h2>
          <p className="micro-hint">
            Informe o ativo, a quantidade e o preço médio de aquisição.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="btn-ghost flex-none"
        >
          Fechar
        </button>
      </div>

      <form ref={formRef} action={formAction} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="relative flex flex-col gap-1.5">
            <label htmlFor="ticker" className="text-sm font-bold">
              Ativo
            </label>
            <input
              id="ticker"
              name="ticker"
              type="text"
              placeholder="PETR4, MXRF11, BTC…"
              autoComplete="off"
              required
              value={ticker}
              onChange={(e) => {
                const value = e.target.value.toUpperCase();
                setTicker(value);
                setIsListOpen(true);
                if (value.trim().length < 3) {
                  setSuggestions([]);
                }
              }}
              onBlur={() => setTimeout(() => setIsListOpen(false), 150)}
              className="field"
            />
            {isListOpen && suggestions.length > 0 && (
              <ul className="absolute top-full z-20 mt-1.5 w-full overflow-hidden rounded-panel border border-border bg-surface shadow-lift">
                {suggestions.map((match) => {
                  const symbol = match.ticker ?? match.symbol ?? '';
                  return (
                    <li key={symbol}>
                      <button
                        type="button"
                        onMouseDown={() => handlePick(match)}
                        className="flex w-full flex-col items-start px-4 py-2.5 text-left transition-colors hover:bg-primary-wash"
                      >
                        <span className="text-sm font-extrabold">{symbol}</span>
                        {(match.name ?? match.longName) && (
                          <span className="line-clamp-1 text-xs font-medium text-muted-foreground">
                            {match.name ?? match.longName}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="assetType" className="text-sm font-bold">
              Que tipo de ativo é?
            </label>
            <select
              id="assetType"
              name="assetType"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className="field"
            >
              <option value="stock">Ação</option>
              <option value="fii">FII (fundo imobiliário)</option>
              <option value="bdr">BDR (empresa de fora, negociada aqui)</option>
              <option value="etf">ETF (fundo de índice)</option>
              <option value="crypto">Criptomoeda</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="quantity" className="text-sm font-bold">
              Quantidade
            </label>
            <input
              id="quantity"
              name="quantity"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              required
              className="field"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="avgPrice" className="text-sm font-bold">
              Preço médio de aquisição
            </label>
            <input
              id="avgPrice"
              name="avgPrice"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              required
              className="field"
            />
            <span className="text-xs font-medium text-muted-foreground">
              Em caso de aportes em datas distintas, informe o preço médio ponderado.
            </span>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="purchaseDate" className="text-sm font-bold">
              Data de aquisição{' '}
              <span className="font-medium text-muted-foreground">
                (opcional)
              </span>
            </label>
            <input
              id="purchaseDate"
              name="purchaseDate"
              type="date"
              className="field sm:max-w-xs"
            />
          </div>
        </div>

        {state.error && (
          <p className="text-sm font-semibold text-negative">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="btn-primary self-start"
        >
          {isPending ? 'Salvando…' : 'Adicionar posição'}
        </button>
      </form>
    </section>
  );
}
