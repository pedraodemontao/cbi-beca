'use client';

import { useMemo, useState } from 'react';
import { NumberField } from '@/components/calculadoras/number-field';
import { formatBRL } from '@/lib/format';
import type { FiiOption } from '@/lib/ceiling-data';

/**
 * "Investindo tanto nesse fundo, quanto cai na minha conta por mês."
 *
 * É o inverso da calculadora de renda passiva, que parte da meta e devolve o
 * patrimônio necessário. Aqui a usuária parte do que ela tem.
 *
 * Escolher o fundo preenche cotação e rendimento a partir do nosso catálogo —
 * os dois campos continuam editáveis pra simular cenário ou usar um fundo que
 * ainda não entrou na base.
 */

/** Patrimônios que a barra compara. */
const PRESETS = [5_000, 10_000, 50_000, 100_000] as const;

interface FiiIncomeCalculatorProps {
  funds: FiiOption[];
}

export function FiiIncomeCalculator({ funds }: FiiIncomeCalculatorProps) {
  const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState(0);
  const [monthlyDividend, setMonthlyDividend] = useState(0);
  const [amount, setAmount] = useState(5_000);

  const selected = useMemo(
    () => funds.find((fund) => fund.ticker === ticker.trim().toUpperCase()) ?? null,
    [funds, ticker]
  );

  function pickFund(value: string) {
    setTicker(value);
    const fund = funds.find((item) => item.ticker === value.trim().toUpperCase());
    if (!fund) return;
    setPrice(fund.price);
    // O rendimento do mês sai da média dos 12 meses, não do último pagamento
    // isolado: FII tem mês gordo e mês magro, e um mês só engana pros dois lados.
    setMonthlyDividend(Number((fund.dividends12m / 12).toFixed(4)));
  }

  const shares = price > 0 ? Math.floor(amount / price) : 0;
  const monthlyIncome = shares * monthlyDividend;
  const yearlyIncome = monthlyIncome * 12;
  // Divide pelo que É investido, não pelo que ela digitou: cota não se compra
  // pela metade, e o troco entrava no denominador derrubando o yield. Com cota
  // de R$ 1.200 e aporte de R$ 5.000 sobram R$ 200 parados, e o rendimento
  // aparecia 4% menor do que o fundo de fato paga.
  const investedForReal = shares * price;
  const effectiveYield = investedForReal > 0 ? yearlyIncome / investedForReal : 0;

  const bars = PRESETS.map((preset) => ({
    preset,
    income: price > 0 ? Math.floor(preset / price) * monthlyDividend : 0,
  }));
  const maxIncome = Math.max(1, ...bars.map((bar) => bar.income));

  const hasNumbers = price > 0 && monthlyDividend > 0;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Renda mensal de um fundo
      </h2>
      <p className="micro-hint">
        Informe o fundo e o valor a investir para estimar a quantidade de
        cotas e a renda mensal em distribuições.
      </p>

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-sm font-bold">Fundo</span>
        <input
          list="fii-options"
          value={ticker}
          onChange={(event) => pickFund(event.target.value)}
          placeholder="Digita o ticker (ex.: HGLG11)"
          autoComplete="off"
          spellCheck={false}
          className="field uppercase placeholder:normal-case"
        />
        <datalist id="fii-options">
          {funds.map((fund) => (
            <option key={fund.ticker} value={fund.ticker}>
              {fund.name}
            </option>
          ))}
        </datalist>
        <span className="text-xs font-medium text-muted-foreground">
          {selected
            ? `${selected.name} — cotação e rendimento preenchidos da minha base.`
            : `${funds.length} fundos disponíveis. Para fundos fora da lista, informe cotação e rendimento manualmente.`}
        </span>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NumberField label="Cotação" prefix="R$" value={price} onChange={setPrice} step={0.01} />
        <NumberField
          label="Rendimento mensal por cota"
          prefix="R$"
          value={monthlyDividend}
          onChange={setMonthlyDividend}
          step={0.01}
        />
        <NumberField
          label="Valor a investir"
          prefix="R$"
          value={amount}
          onChange={setAmount}
          step={100}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => setAmount(preset)}
            aria-pressed={amount === preset}
            className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
              amount === preset
                ? 'border-primary bg-primary-wash text-primary'
                : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            {formatBRL(preset)}
          </button>
        ))}
      </div>

      {hasNumbers ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-panel bg-panel p-4">
              <p className="micro-label">Cotas adquiridas</p>
              <p className="num mt-1 text-2xl font-extrabold">
                {shares.toLocaleString('pt-BR')}
              </p>
            </div>
            <div className="rounded-panel bg-primary-wash p-4">
              <p className="micro-label">Renda mensal estimada</p>
              <p className="num mt-1 text-[clamp(1.7rem,6vw,2.2rem)] font-extrabold leading-none text-primary-deep">
                {formatBRL(monthlyIncome)}
              </p>
              <p className="micro-hint mt-1">
                {formatBRL(yearlyIncome)} no ano — {(effectiveYield * 100).toFixed(1).replace('.', ',')}%
                sobre o que você investiu
              </p>
            </div>
          </div>

          <p className="micro-label mt-6">Renda mensal por patrimônio investido</p>
          <ul className="mt-3 flex h-36 items-end gap-3">
            {bars.map(({ preset, income }) => (
              <li
                key={preset}
                // Altura da barra é percentual: sem altura definida no pai ela
                // resolveria pra zero e o gráfico sumiria.
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="num text-xs font-bold text-primary">
                  {formatBRL(income)}
                </span>
                <span
                  className={`w-full rounded-t-lg ${
                    amount === preset ? 'bg-primary-surface' : 'bg-positive'
                  }`}
                  style={{ height: `${Math.max(4, (income / maxIncome) * 100)}%` }}
                />
                <span className="num text-[0.65rem] font-bold text-muted-foreground sm:text-xs">
                  {formatBRL(preset)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-6 rounded-panel bg-panel p-4 text-sm font-medium text-muted-foreground">
          Selecione um fundo acima ou informe cotação e rendimento
          manualmente.
        </p>
      )}

      <p className="mt-4 text-xs font-medium text-muted-foreground">
        O rendimento é a média do que o fundo pagou nos últimos 12 meses. Fundo
        imobiliário distribui o que arrecada de aluguel, e isso muda: mês com
        vacância paga menos. É noção de grandeza, não promessa.
      </p>
    </section>
  );
}


