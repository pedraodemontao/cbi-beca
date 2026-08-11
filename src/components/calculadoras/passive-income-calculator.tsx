'use client';

import { useState } from 'react';
import { NumberField } from '@/components/calculadoras/number-field';
import { formatBRL } from '@/lib/format';

export function PassiveIncomeCalculator() {
  const [target, setTarget] = useState(3000);
  const [yieldPercent, setYieldPercent] = useState(8);
  const [monthly, setMonthly] = useState(500);

  // Rendimento zero não tem patrimônio suficiente: a conta é uma divisão por
  // zero. Enquanto isso virava 0, a tela anunciava "precisa de R$ 0,00" e
  // "chega em 0 meses" — o oposto do certo.
  const hasYield = yieldPercent > 0;
  const neededPatrimony = hasYield ? (target * 12) / (yieldPercent / 100) : null;

  // Meses até juntar o patrimônio, reinvestindo os proventos
  const monthlyRate = (1 + yieldPercent / 100) ** (1 / 12) - 1;
  let balance = 0;
  let months = 0;
  const LIMIT = 12 * 80;
  while (neededPatrimony !== null && balance < neededPatrimony && months < LIMIT && monthly > 0) {
    balance = balance * (1 + monthlyRate) + monthly;
    months += 1;
  }
  const reachable = neededPatrimony !== null && months < LIMIT && monthly > 0;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Patrimônio para renda mensal
      </h2>
      <p className="micro-hint">
        Patrimônio necessário para que os proventos distribuídos — dividendos
        de ações ou rendimentos de fundos — atinjam a renda mensal desejada.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField
          label="Renda mensal desejada"
          prefix="R$"
          value={target}
          onChange={setTarget}
        />
        <NumberField
          label="Rendimento anual"
          suffix="%"
          value={yieldPercent}
          onChange={setYieldPercent}
          step={0.5}
        />
        <NumberField
          label="Aporte mensal possível"
          prefix="R$"
          value={monthly}
          onChange={setMonthly}
        />
      </div>

      <div className="mt-6 rounded-panel bg-primary-wash p-5">
        <p className="micro-label">Patrimônio necessário</p>
        <p className="num mt-1 text-[clamp(1.9rem,7vw,2.6rem)] font-extrabold leading-none text-primary-deep">
          {neededPatrimony === null ? '—' : formatBRL(neededPatrimony)}
        </p>
        <p className="mt-3 border-t border-primary-tint pt-4 text-sm font-semibold">
          {reachable ? (
            <>
              Com aporte de {formatBRL(monthly)} por mês e reinvestimento
              integral, o prazo estimado é de{' '}
              <strong className="text-primary-deep">
                {months >= 12
                  ? `${Math.floor(months / 12)} ano${Math.floor(months / 12) > 1 ? 's' : ''}${
                      months % 12 > 0 ? ` e ${months % 12} meses` : ''
                    }`
                  : `${months} ${months === 1 ? 'mês' : 'meses'}`}
              </strong>
              .
            </>
          ) : neededPatrimony === null ? (
            <span className="text-muted-foreground">
              Informe um rendimento anual maior que zero: sem rendimento não há
              patrimônio que sustente a renda desejada.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Com esse aporte mensal o prazo ultrapassa 80 anos. Aumente o
              aporte ou reduza a renda desejada.
            </span>
          )}
        </p>
      </div>

      <p className="mt-3 text-xs font-medium text-muted-foreground">
        Cálculo simplificado, sem considerar tributação nem inflação. Não
        constitui promessa de retorno.
      </p>
    </section>
  );
}


