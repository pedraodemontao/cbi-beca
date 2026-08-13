'use client';

import { useState } from 'react';
import { NumberField } from '@/components/calculadoras/number-field';
import { formatBRL, formatQuantity } from '@/lib/format';
import { extremeIndex, simulate, type ComparisonRow } from '@/lib/comparison';

interface InvestmentSimulatorProps {
  rows: ComparisonRow[];
}

export function InvestmentSimulator({ rows }: InvestmentSimulatorProps) {
  const [amount, setAmount] = useState(5_000);

  const results = rows.map((row) => ({ row, sim: simulate(row, amount) }));
  const highestIncome = extremeIndex(
    results.map((result) => result.sim.yearlyIncome),
    'max'
  );

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        O mesmo aporte em cada um
      </h2>
      <p className="micro-hint">
        Quanto o mesmo valor teria rendido em proventos nos últimos 12 meses, se
        aplicado em cada ativo.
      </p>

      <div className="mt-4 max-w-xs">
        <NumberField
          label="Valor aportado em cada ativo"
          value={amount}
          onChange={setAmount}
          prefix="R$"
          max={100_000_000}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {results.map(({ row, sim }, index) => (
          <article key={row.ticker} className="rounded-panel border border-border bg-panel p-4">
            <header className="flex items-center justify-between gap-2">
              <span className="num text-base font-extrabold">{row.ticker}</span>
              {index === highestIncome && (
                <span className="chip chip-neutral text-[0.65rem] uppercase tracking-wide">
                  maior renda
                </span>
              )}
            </header>

            <p className="num mt-3 text-2xl font-extrabold text-primary">
              {sim.monthlyIncome === null ? '—' : formatBRL(sim.monthlyIncome)}
              <span className="text-sm font-bold text-muted-foreground"> /mês</span>
            </p>

            <dl className="num mt-3 flex flex-col gap-1.5 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">No ano</dt>
                <dd className="font-bold">
                  {sim.yearlyIncome === null ? '—' : formatBRL(sim.yearlyIncome)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">
                  {row.assetType === 'fii' ? 'Cotas' : 'Ações'}
                </dt>
                <dd className="font-bold">{formatQuantity(sim.shares)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-muted-foreground">Investido</dt>
                <dd className="font-bold">{formatBRL(sim.invested)}</dd>
              </div>
              {/* O troco é informação, não detalhe: é ele que explica por que o
                  ativo caro rende menos que o barato com o mesmo aporte. */}
              {sim.leftover > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="font-medium text-muted-foreground">Sobra parada</dt>
                  <dd className="font-bold text-muted-foreground">
                    {formatBRL(sim.leftover)}
                  </dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>

      <p className="micro-hint mt-4">
        A conta usa o valor de fato investido — cotas inteiras vezes a cotação —,
        não o valor digitado. Cota não se compra pela metade, e o troco não rende
        nada. Rendimento passado não é promessa de pagamento futuro: os
        proventos dos próximos 12 meses podem ser maiores, menores ou nenhum.
      </p>
    </section>
  );
}
