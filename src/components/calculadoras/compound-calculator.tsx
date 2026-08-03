'use client';

import { useState } from 'react';
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
        Quanto meu dinheiro vira com o tempo
      </h2>
      <p className="micro-hint">
        O juro composto é o teu dinheiro rendendo em cima do que já rendeu. É
        devagar no começo e vira bola de neve depois.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="Quanto você já tem hoje"
          prefix="R$"
          value={initial}
          onChange={setInitial}
        />
        <Field
          label="Quanto vai guardar por mês"
          prefix="R$"
          value={monthly}
          onChange={setMonthly}
        />
        <Field label="Por quantos anos" suffix="anos" value={years} onChange={setYears} />
        <Field
          label="Rendimento por ano"
          suffix="%"
          value={yearlyRate}
          onChange={setYearlyRate}
          step={0.5}
        />
      </div>

      <div className="mt-6 rounded-panel bg-primary-wash p-5">
        <p className="micro-label">No fim você teria</p>
        <p className="num mt-1 text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none text-primary-deep">
          {formatBRL(total)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-primary-tint pt-4 text-sm">
          <div>
            <dt className="font-semibold text-muted-foreground">
              Saiu do teu bolso
            </dt>
            <dd className="num font-extrabold">{formatBRL(invested)}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">
              Rendeu sozinho
            </dt>
            <dd className="num font-extrabold text-primary-deep">
              {formatBRL(earned)}
            </dd>
          </div>
        </dl>
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Simulação com rendimento constante — na vida real ele varia todo mês.
        Serve pra você ter noção de grandeza, não é promessa de retorno.
      </p>
    </section>
  );
}

interface FieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: number;
}

function Field({ label, value, onChange, prefix, suffix, step = 1 }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <span className="flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
        {prefix && (
          <span className="text-sm font-bold text-muted-foreground">{prefix}</span>
        )}
        <input
          type="number"
          min="0"
          step={step}
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="num w-full bg-transparent py-3 text-base outline-none"
        />
        {suffix && (
          <span className="text-sm font-bold text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  );
}
