'use client';

import { useState } from 'react';
import { NumberField } from '@/components/calculadoras/number-field';
import { formatBRL } from '@/lib/format';

export function CompoundCalculator() {
  const [initial, setInitial] = useState(1000);
  const [monthly, setMonthly] = useState(300);
  const [years, setYears] = useState(10);
  const [yearlyRate, setYearlyRate] = useState(10);

  const months = Math.round(years * 12);
  const monthlyRate = (1 + yearlyRate / 100) ** (1 / 12) - 1;

  let total = initial;
  for (let month = 0; month < months; month += 1) {
    total = total * (1 + monthlyRate) + monthly;
  }

  const invested = initial + monthly * months;
  const earned = total - invested;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Juros compostos
      </h2>
      <p className="micro-hint">
        Projeção do montante acumulado quando o rendimento incide também
        sobre os rendimentos anteriores.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Valor inicial"
          prefix="R$"
          value={initial}
          onChange={setInitial}
        />
        <NumberField
          label="Aporte mensal"
          prefix="R$"
          value={monthly}
          onChange={setMonthly}
        />
        <NumberField
          label="Período"
          suffix="anos"
          value={years}
          onChange={setYears}
          step={1}
          // O laço roda mês a mês, de forma síncrona, a cada tecla. Sem teto,
          // um número grande trava a aba e o montante vira Infinity — que o
          // formatador imprimia como "R$ ∞".
          max={80}
        />
        <NumberField
          label="Rendimento anual"
          suffix="%"
          value={yearlyRate}
          onChange={setYearlyRate}
          step={0.5}
        />
      </div>

      <div className="mt-6 rounded-panel bg-primary-wash p-5">
        <p className="micro-label">Montante final</p>
        <p className="num mt-1 text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none text-primary-deep">
          {formatBRL(total)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-primary-tint pt-4 text-sm">
          <div>
            <dt className="font-semibold text-muted-foreground">
              Total aportado
            </dt>
            <dd className="num font-extrabold">{formatBRL(invested)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">
              Rendimento acumulado
            </dt>
            <dd className="num font-extrabold text-primary-deep">
              {formatBRL(earned)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        A simulação assume rendimento constante; na prática ele varia a cada
        período. Não constitui promessa de retorno.
      </p>
    </section>
  );
}


