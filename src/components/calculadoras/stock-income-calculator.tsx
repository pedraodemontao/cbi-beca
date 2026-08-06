'use client';

import { useMemo, useState } from 'react';
import { formatBRL } from '@/lib/format';
import { AssetLogo } from '@/components/shared/asset-logo';
import type { StockOption } from '@/lib/ceiling-data';

/**
 * "Investindo tanto nessa ação, quanto ela me paga de dividendo."
 *
 * Escolher a empresa preenche cotação e dividend yield do nosso catálogo, e o
 * CDI vem do Banco Central — a versão avulsa dessa calculadora precisa que a
 * pessoa cole um token da brapi e digite o CDI na mão.
 *
 * O número que só a gente consegue mostrar é o LÍQUIDO: JCP tem 15% de imposto
 * na fonte e dividendo não, e como guardamos o tipo de cada pagamento dá pra
 * dizer quanto sobra de verdade.
 */

const PRESETS = [5_000, 10_000, 50_000, 100_000] as const;
const HORIZONS = [5, 10, 20] as const;

/** Imposto retido na fonte sobre juros sobre capital próprio. */
const JCP_TAX = 0.15;

/**
 * Faixas de dividend yield, medidas no próprio catálogo em 2026-08-06 (134
 * ações líquidas, fora as de rendimento atípico): os quartis caem em 3,11%,
 * 5,59% e 8,20%. Os cortes abaixo são esses, arredondados.
 */
const DY_TIERS = [
  { max: 0.03, label: 'DY baixo pra bolsa brasileira', tone: 'muted' },
  { max: 0.056, label: 'DY moderado — metade da bolsa paga menos', tone: 'muted' },
  { max: 0.082, label: 'DY bom — acima de 3 em cada 4 empresas', tone: 'positive' },
  { max: Infinity, label: 'DY alto — top 25% da bolsa', tone: 'positive' },
] as const;

interface StockIncomeCalculatorProps {
  stocks: StockOption[];
  /**
   * CDI anual EM PERCENTUAL (14,15 e não 0,1415) — é o que `getCurrentCdiYearly`
   * devolve. Nulo quando o Banco Central não responde.
   */
  cdiYearlyPercent: number | null;
}

export function StockIncomeCalculator({
  stocks,
  cdiYearlyPercent,
}: StockIncomeCalculatorProps) {
  const [ticker, setTicker] = useState('');
  const [price, setPrice] = useState(0);
  const [dyPercent, setDyPercent] = useState(0);
  const [amount, setAmount] = useState(5_000);
  const [years, setYears] = useState<number>(10);

  const selected = useMemo(
    () => stocks.find((stock) => stock.ticker === ticker.trim().toUpperCase()) ?? null,
    [stocks, ticker]
  );

  function pickStock(value: string) {
    setTicker(value);
    const stock = stocks.find((item) => item.ticker === value.trim().toUpperCase());
    if (!stock) return;
    setPrice(stock.price);
    setDyPercent(Number(((stock.dividends12m / stock.price) * 100).toFixed(2)));
  }

  const dy = dyPercent / 100;
  const shares = price > 0 ? Math.floor(amount / price) : 0;
  const investedForReal = shares * price;
  const grossYearly = investedForReal * dy;

  // A parte paga como JCP chega com 15% a menos. Sem empresa escolhida não dá
  // pra saber a composição, então o líquido some em vez de chutar.
  const jcpShare = selected?.jcpShare ?? null;
  const netYearly =
    jcpShare === null ? null : grossYearly * (1 - jcpShare * JCP_TAX);

  const tier = DY_TIERS.find((item) => dy < item.max) ?? DY_TIERS[DY_TIERS.length - 1];
  // Os dois em pontos percentuais, pra diferença sair em p.p.
  const cdiGap = cdiYearlyPercent === null ? null : dyPercent - cdiYearlyPercent;

  // As barras mostram o MESMO líquido do número grande. Misturar bruto no
  // gráfico com líquido no destaque faria a usuária achar que errou a conta.
  const netFactor = jcpShare === null ? 1 : 1 - jcpShare * JCP_TAX;
  const bars = PRESETS.map((preset) => ({
    preset,
    income: price > 0 ? Math.floor(preset / price) * price * dy * netFactor : 0,
  }));
  const maxIncome = Math.max(1, ...bars.map((bar) => bar.income));

  // Reinvestindo tudo com o mesmo yield e o preço parado, o patrimônio compõe.
  // É cenário de estudo: preço parado por 20 anos não existe.
  const projected = investedForReal * (1 + dy * netFactor) ** years;
  const projectedYearly = projected * dy * netFactor;

  const hasNumbers = price > 0 && dy > 0;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Quanto uma ação me paga de dividendo
      </h2>
      <p className="micro-hint">
        Escolhe a empresa e diz quanto você pensa em investir. Eu mostro quantas
        ações dá pra comprar e quanto elas te pagariam por ano.
      </p>

      <label className="mt-5 flex flex-col gap-1.5">
        <span className="text-sm font-bold">Qual empresa</span>
        <input
          list="stock-options"
          value={ticker}
          onChange={(event) => pickStock(event.target.value)}
          placeholder="Digita o ticker (ex.: ITSA4)"
          autoComplete="off"
          spellCheck={false}
          className="field uppercase placeholder:normal-case"
        />
        <datalist id="stock-options">
          {stocks.map((stock) => (
            <option key={stock.ticker} value={stock.ticker}>
              {stock.name}
            </option>
          ))}
        </datalist>
      </label>

      {selected ? (
        <div className="mt-3 flex items-center gap-3 rounded-panel border border-border bg-panel px-4 py-3">
          <AssetLogo ticker={selected.ticker} url={selected.logoUrl} size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{selected.name}</p>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {selected.sector ?? selected.ticker}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs font-medium text-muted-foreground">
          {stocks.length} empresas disponíveis. Se a tua não estiver aqui,
          preenche cotação e dividend yield na mão.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Cotação" prefix="R$" value={price} onChange={setPrice} step={0.01} />
        <Field
          label="Dividend yield (12m)"
          suffix="%"
          value={dyPercent}
          onChange={setDyPercent}
          step={0.1}
        />
        <Field
          label="Quanto vou investir"
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
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone={tier.tone}>{tier.label}</Badge>
            {cdiGap !== null && (
              <Badge tone={cdiGap >= 0 ? 'positive' : 'negative'}>
                {cdiGap >= 0 ? '+' : '−'}
                {Math.abs(cdiGap).toFixed(1).replace('.', ',')} pontos{' '}
                {cdiGap >= 0 ? 'acima' : 'abaixo'} do CDI (
                {cdiYearlyPercent!.toFixed(2).replace('.', ',')}%)
              </Badge>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-panel bg-panel p-4">
              <p className="micro-label">Ações que dá pra comprar</p>
              <p className="num mt-1 text-2xl font-extrabold">
                {shares.toLocaleString('pt-BR')}
              </p>
              <p className="micro-hint mt-1">
                {formatBRL(investedForReal)} investidos de verdade — ação não se
                compra pela metade.
              </p>
            </div>
            <div className="rounded-panel bg-primary-wash p-4">
              <p className="micro-label">Te paga por ano</p>
              <p className="num mt-1 text-[clamp(1.7rem,6vw,2.2rem)] font-extrabold leading-none text-primary-deep">
                {formatBRL(netYearly ?? grossYearly)}
              </p>
              <p className="micro-hint mt-1">
                ≈ {formatBRL((netYearly ?? grossYearly) / 12)} por mês, na média
              </p>
            </div>
          </div>

          {jcpShare !== null && jcpShare > 0 && (
            <p className="mt-3 rounded-panel border border-border bg-panel px-4 py-3 text-sm font-medium">
              <strong className="font-bold">
                {Math.round(jcpShare * 100)}% do que a {selected!.ticker} pagou no
                último ano foi JCP
              </strong>
              , e o JCP leva 15% de imposto na fonte — dividendo comum não leva.
              Por isso o valor acima já está líquido: o bruto seria{' '}
              {formatBRL(grossYearly)}.
            </p>
          )}

          <p className="micro-label mt-6">Renda anual por patrimônio investido</p>
          <ul className="mt-3 flex h-36 items-end gap-3">
            {bars.map(({ preset, income }) => (
              <li
                key={preset}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="num text-xs font-bold text-primary">
                  {formatBRL(income)}
                </span>
                <span
                  className={`w-full rounded-t-lg ${
                    amount === preset ? 'bg-primary' : 'bg-positive'
                  }`}
                  style={{ height: `${Math.max(4, (income / maxIncome) * 100)}%` }}
                />
                <span className="num text-[0.65rem] font-bold text-muted-foreground sm:text-xs">
                  {formatBRL(preset)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-panel border border-border bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="micro-label">Se você reinvestir tudo</p>
              <div className="flex gap-2">
                {HORIZONS.map((horizon) => (
                  <button
                    key={horizon}
                    type="button"
                    onClick={() => setYears(horizon)}
                    aria-pressed={years === horizon}
                    className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                      years === horizon
                        ? 'border-primary text-primary'
                        : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
                    }`}
                  >
                    {horizon} anos
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="micro-hint">Patrimônio em {years} anos</p>
                <p className="num text-xl font-extrabold text-primary-deep">
                  {formatBRL(projected)}
                </p>
              </div>
              <div>
                <p className="micro-hint">E ele te pagaria por ano</p>
                <p className="num text-xl font-extrabold">
                  {formatBRL(projectedYearly)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Supõe que você reinveste todo dividendo no mesmo rendimento e que o
              preço não muda em {years} anos. Nenhuma das duas coisas acontece na
              vida real — serve pra mostrar a força do reinvestimento, não pra
              prever saldo.
            </p>
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-panel bg-panel p-4 text-sm font-medium text-muted-foreground">
          Escolhe uma empresa ali em cima — ou preenche a cotação e o dividend
          yield na mão — que eu faço a conta.
        </p>
      )}

      <p className="mt-4 text-xs font-medium text-muted-foreground">
        O dividend yield é o que a empresa pagou nos últimos 12 meses sobre a
        cotação de hoje. Empresa não é obrigada a repetir: ano ruim ela paga
        menos, ou não paga.
      </p>
    </section>
  );
}

function Badge({
  tone,
  children,
}: {
  tone: 'muted' | 'positive' | 'negative';
  children: React.ReactNode;
}) {
  const style =
    tone === 'positive'
      ? 'chip-up'
      : tone === 'negative'
        ? 'chip-down'
        : 'chip-neutral';
  return <span className={`chip ${style} text-xs`}>{children}</span>;
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
      <span className="flex items-center gap-2 rounded-panel border border-border bg-panel px-4 focus-within:border-primary">
        {prefix && (
          <span className="text-sm font-bold text-muted-foreground">{prefix}</span>
        )}
        <input
          type="number"
          min="0"
          step={step}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          className="num w-full bg-transparent py-3 text-base outline-none"
        />
        {suffix && (
          <span className="text-sm font-bold text-muted-foreground">{suffix}</span>
        )}
      </span>
    </label>
  );
}
