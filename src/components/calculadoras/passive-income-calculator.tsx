'use client';

import { useState } from 'react';
import { formatBRL } from '@/lib/format';

export function PassiveIncomeCalculator() {
  const [target, setTarget] = useState(3000);
  const [yieldPercent, setYieldPercent] = useState(8);
  const [monthly, setMonthly] = useState(500);

  const neededPatrimony = yieldPercent > 0 ? (target * 12) / (yieldPercent / 100) : 0;

  // Meses até juntar o patrimônio, reinvestindo os proventos
  const monthlyRate = (1 + yieldPercent / 100) ** (1 / 12) - 1;
  let balance = 0;
  let months = 0;
  const LIMIT = 12 * 80;
  while (balance < neededPatrimony && months < LIMIT && monthly > 0) {
    balance = balance * (1 + monthlyRate) + monthly;
    months += 1;
  }
  const reachable = months < LIMIT && monthly > 0;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Quanto preciso pra viver de renda
      </h2>
      <p className="micro-hint">
        Renda passiva é o dinheiro que cai na tua conta sem você trabalhar por
        ele — tipo o aluguel dos FIIs ou os dividendos das ações.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label="Quero receber por mês"
          prefix="R$"
          value={target}
          onChange={setTarget}
        />
        <Field
          label="Rendimento por ano"
          suffix="%"
          value={yieldPercent}
          onChange={setYieldPercent}
          step={0.5}
        />
        <Field
          label="Consigo guardar por mês"
          prefix="R$"
          value={monthly}
          onChange={setMonthly}
        />
      </div>

      <div className="mt-6 rounded-panel bg-primary-wash p-5">
        <p className="micro-label">Você precisaria ter</p>
        <p className="num mt-1 text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none text-primary-deep">
          {formatBRL(neededPatrimony)}
        </p>
        <p className="mt-3 border-t border-primary-tint pt-4 text-sm font-semibold">
          {reachable ? (
            <>
              Guardando {formatBRL(monthly)} por mês e reinvestindo tudo, você
              chegaria lá em{' '}
              <strong className="text-primary-deep">
                {months >= 12
                  ? `${Math.floor(months / 12)} ano${Math.floor(months / 12) > 1 ? 's' : ''}${
                      months % 12 > 0 ? ` e ${months % 12} meses` : ''
                    }`
                  : `${months} meses`}
              </strong>
              .
            </>
          ) : (
            <span className="text-muted-foreground">
              Com esse valor mensal a conta passa de 80 anos. Aumenta o aporte
              ou ajusta a meta — sem susto, é só matemática.
            </span>
          )}
        </p>
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Conta simplificada, sem imposto e sem inflação. É pra dar direção, não é
        promessa de retorno.
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
