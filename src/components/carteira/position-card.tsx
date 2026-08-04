'use client';

import { useState } from 'react';
import Link from 'next/link';
import { deletePosition } from '@/app/carteira/actions';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/format';
import { EditPositionForm } from '@/components/carteira/edit-position-form';
import type { TickerHolding } from '@/types/portfolio';

interface PositionCardProps {
  holding: TickerHolding;
  purchaseDates: Map<string, string | null>;
  dayChangePercent: number | null;
  /** Teto pra render 6% ao ano; nulo quando ainda não tenho o lucro da empresa. */
  ceiling: number | null;
}

export function PositionCard({
  holding,
  purchaseDates,
  dayChangePercent,
  ceiling,
}: PositionCardProps) {
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [showLots, setShowLots] = useState(false);

  const isFii = holding.assetType === 'fii';
  const isDown = holding.profit !== null && holding.profit < 0;
  const hasMultipleLots = holding.lots.length > 1;

  const editingLot = holding.lots.find((lot) => lot.positionId === editingLotId);
  if (editingLot) {
    return (
      <article className="card">
        <EditPositionForm
          valuation={editingLot}
          purchaseDate={purchaseDates.get(editingLot.positionId) ?? null}
          onDone={() => setEditingLotId(null)}
        />
      </article>
    );
  }

  return (
    <article className="card flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/ativo/${holding.ticker}`}
              className="text-lg font-extrabold tracking-tight hover:text-primary hover:underline"
            >
              {holding.ticker}
            </Link>
            <span
              className={`chip px-2.5 py-1 text-xs ${
                isFii ? 'bg-accent text-accent-foreground' : 'chip-up'
              }`}
            >
              {isFii ? 'FII' : 'Ação'}
            </span>
            {hasMultipleLots && (
              <span className="chip chip-neutral px-2.5 py-1 text-xs">
                {holding.lots.length} compras
              </span>
            )}
          </div>
          {holding.currentValue !== null ? (
            <p className="num mt-1 text-2xl font-extrabold">
              {formatBRL(holding.currentValue)}
            </p>
          ) : (
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              Preço indisponível agora
            </p>
          )}
        </div>

        {dayChangePercent !== null && (
          <span className={`chip ${dayChangePercent >= 0 ? 'chip-up' : 'chip-down'}`}>
            {dayChangePercent >= 0 ? '↑' : '↓'} {formatPercent(dayChangePercent)}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3.5 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            Você tem
          </dt>
          <dd className="num mt-0.5 font-bold">
            {formatQuantity(holding.quantity)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            Pagou, em média
          </dt>
          <dd className="num mt-0.5 font-bold">{formatBRL(holding.avgPrice)}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            Preço agora
          </dt>
          <dd className="num mt-0.5 font-bold">
            {holding.currentPrice !== null
              ? formatBRL(holding.currentPrice)
              : '—'}
          </dd>
        </div>
      </dl>

      {holding.profit !== null && (
        <p
          className={`num text-sm font-bold ${
            isDown ? 'text-negative' : 'text-positive'
          }`}
        >
          {isDown ? '' : '+'}
          {formatBRL(holding.profit)}
          {holding.profitPercent !== null &&
            ` (${formatPercent(holding.profitPercent)})`}{' '}
          <span className="font-medium text-muted-foreground">desde a compra</span>
        </p>
      )}

      {ceiling !== null && holding.currentPrice !== null && (
        <Link
          href={`/ativo/${holding.ticker}`}
          className="flex items-center justify-between gap-2 rounded-panel bg-background px-3.5 py-2.5 text-sm transition-colors hover:bg-primary-wash"
        >
          <span className="font-medium text-muted-foreground">
            {holding.currentPrice <= ceiling
              ? 'Ainda dá pra comprar abaixo do teto'
              : 'Hoje está acima do teto'}
          </span>
          <span
            className={`num font-extrabold ${
              holding.currentPrice <= ceiling ? 'text-positive' : 'text-negative'
            }`}
          >
            {formatBRL(ceiling)}
          </span>
        </Link>
      )}

      {isDown && (
        <p className="rounded-panel bg-accent px-3.5 py-2.5 text-sm font-medium text-accent-text">
          Respira — o preço oscila todo dia. Queda só vira prejuízo se você
          vender.
        </p>
      )}

      {showLots && (
        <ul className="flex flex-col gap-2 rounded-panel bg-background p-3">
          <li className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Tuas compras desse ativo
          </li>
          {holding.lots.map((lot) => (
            <li
              key={lot.positionId}
              className="flex items-center justify-between gap-2 border-t border-border pt-2 text-sm first:border-0 first:pt-0"
            >
              <span className="num font-semibold">
                {formatQuantity(lot.quantity)} × {formatBRL(lot.avgPrice)}
              </span>
              <span className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setEditingLotId(lot.positionId)}
                  className="rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary-wash hover:text-primary-deep"
                >
                  Editar
                </button>
                <form action={deletePosition}>
                  <input type="hidden" name="id" value={lot.positionId} />
                  <button
                    type="submit"
                    aria-label={`Remover esta compra de ${holding.ticker}`}
                    className="rounded-full px-2.5 py-1 text-xs font-bold text-muted-foreground transition-colors hover:bg-negative-tint hover:text-negative-deep"
                  >
                    Remover
                  </button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
        <Link
          href={`/ativo/${holding.ticker}`}
          className="text-xs font-bold text-primary hover:underline"
        >
          Ver detalhes →
        </Link>

        {hasMultipleLots ? (
          <button
            type="button"
            onClick={() => setShowLots((open) => !open)}
            className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary-wash hover:text-primary-deep"
          >
            {showLots ? 'Esconder compras' : 'Ver minhas compras'}
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditingLotId(holding.lots[0].positionId)}
              className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-primary-wash hover:text-primary-deep"
            >
              Editar
            </button>
            <form action={deletePosition}>
              <input
                type="hidden"
                name="id"
                value={holding.lots[0].positionId}
              />
              <button
                type="submit"
                aria-label={`Remover ${holding.ticker} da carteira`}
                className="rounded-full px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-negative-tint hover:text-negative-deep"
              >
                Remover
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
