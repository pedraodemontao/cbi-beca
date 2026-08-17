'use client';

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  buildCeilingProjection,
  bazinCeiling,
  gordonCeiling,
  fiiCeiling,
  profitDeviation,
  safetyMargin,
  DEFAULT_PAYOUT,
  DEFAULT_FII_YIELD,
  FII_YIELD_RANGE,
  TARGET_YIELDS,
  type CeilingProjection,
  type ProfitDeviation,
} from '@/lib/ceiling-price';
import { formatBRL, formatRatio, formatRatioSigned } from '@/lib/format';
import { InfoNote } from '@/components/shared/info-note';
import { OverrideForm } from '@/components/preco-teto/override-form';
import { Sparkline } from '@/components/preco-teto/sparkline';
import { AssetLogo } from '@/components/shared/asset-logo';
import type { AppliedOverride, CeilingAsset, MarketAssetType } from '@/types/ceiling';

/**
 * A tabela do preço teto, nos quatro métodos.
 *
 * Roda inteira no client de propósito: mexer no payout tem que recalcular as
 * centenas de linhas na hora, e `lib/ceiling-price.ts` é pura justamente pra
 * isso — sem ida ao servidor, sem estado intermediário.
 */

const PAGE_SIZE = 30;

/**
 * Rede pra quando não existe mediana histórica (empresa nova, ou balanço que a
 * bolsai não tem): preço abaixo de 6 anos de lucro costuma esconder venda de
 * ativo ou crédito tributário no resultado.
 *
 * É proxy, e proxy erra — PETR4 fica em 5,1 de P/L com lucro perfeitamente
 * normal pra ela. Quando há mediana, quem manda é a comparação com o próprio
 * histórico. O critério nunca é o dividendo projetado, porque o payout é a
 * alavanca que a usuária mexe e o selo não pode piscar a cada arrasto do slider.
 */
const OUTLIER_PRICE_EARNINGS = 6;

/**
 * Piso de volume financeiro no dia. Abaixo disso o papel mal negocia e a
 * cotação fica parada há dias — EQPA7 e BNBR3 trocaram 200 ações num pregão em
 * que PETR4 trocou 25 milhões, e o preço velho deles inventa margem de +1.400%.
 */
const MIN_DAILY_TRADED = 1_000_000;

/**
 * Quem pagou mais de 15% do próprio preço em 12 meses quase nunca estava
 * distribuindo lucro recorrente: costuma ser devolução de capital, venda de
 * imóvel ou dividendo extraordinário. Vale pros dois lados — RBRI11 aparece com
 * 240% de amortização contada como rendimento, e ALLD3 com 64% no Bazin.
 */
const OUTLIER_DIVIDEND_YIELD = 0.15;

/** Padrões de Gordon: o que se costuma exigir de retorno e supor de crescimento. */
const DEFAULT_REQUIRED_RETURN = 10;
const DEFAULT_GROWTH = 4;

type MethodKey = 'projected' | 'bazin' | 'graham' | 'gordon';

interface MethodInfo {
  key: MethodKey;
  label: string;
  hint: string;
}

const METHODS: MethodInfo[] = [
  {
    key: 'projected',
    label: 'Projetado',
    hint: 'Projeta o dividendo a partir do lucro atual e do payout informado.',
  },
  {
    key: 'bazin',
    label: 'Bazin',
    hint: 'Usa os dividendos efetivamente pagos, sem projeção de lucro.',
  },
  {
    key: 'graham',
    label: 'Graham',
    hint: 'Valor justo pela fórmula de Graham: √(22,5 × LPA × VPA).',
  },
  {
    key: 'gordon',
    label: 'Gordon',
    hint: 'Desconta o fluxo de dividendos supondo crescimento anual constante.',
  },
];

/** O payout só entra na conta de quem projeta dividendo a partir do lucro. */
const METHODS_WITH_PAYOUT: MethodKey[] = ['projected', 'gordon'];

type SortKey = 'margin' | 'size' | 'ticker';

const SORT_LABELS: Record<SortKey, string> = {
  // "recorrente" avisa que quem tem selo de atípico sai da frente da fila.
  margin: 'Maior margem de segurança',
  size: 'Maiores empresas',
  ticker: 'Ordem alfabética',
};

interface MethodColumn {
  label: string;
  value: number | null;
  /** Coluna de teto — no mobile a primeira delas vira o número grande do card. */
  strong?: boolean;
}

interface CeilingRow {
  asset: CeilingAsset;
  projection: CeilingProjection;
  isOutlier: boolean;
  /** Pra que lado o lucro fugiu do normal. Nulo quando não há mediana. */
  profitDeviation: ProfitDeviation;
  isLiquid: boolean;
  override: AppliedOverride | undefined;
  columns: MethodColumn[];
  ceiling: number | null;
  margin: number | null;
}

interface CeilingTableProps {
  assets: CeilingAsset[];
  overrides: AppliedOverride[];
  /** Tickers que a usuária já tem — ganham selo e filtro próprio. */
  ownedTickers: string[];
  /** A Beca: o formulário dela publica o ajuste pra todas as usuárias. */
  isCurator: boolean;
}

export function CeilingTable({
  assets,
  overrides,
  ownedTickers,
  isCurator,
}: CeilingTableProps) {
  const [kind, setKind] = useState<'stock' | 'fii'>('stock');
  const [method, setMethod] = useState<MethodKey>('projected');
  const [sector, setSector] = useState('all');
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [payoutPercent, setPayoutPercent] = useState(DEFAULT_PAYOUT * 100);
  const [requiredReturnPercent, setRequiredReturnPercent] = useState(
    DEFAULT_REQUIRED_RETURN
  );
  const [growthPercent, setGrowthPercent] = useState(DEFAULT_GROWTH);
  const [bazinBase, setBazinBase] = useState<BazinBase>('12m');
  const [fiiYieldPercent, setFiiYieldPercent] = useState(DEFAULT_FII_YIELD * 100);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('margin');
  const [onlyLiquid, setOnlyLiquid] = useState(true);
  const [onlyBelowCeiling, setOnlyBelowCeiling] = useState(false);
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const overrideByTicker = useMemo(
    () => new Map(overrides.map((override) => [override.ticker, override])),
    [overrides]
  );

  const owned = useMemo(() => new Set(ownedTickers), [ownedTickers]);

  /** Sem dividendo gravado não existe Bazin — a aba avisa em vez de mentir. */
  const hasDividendData = useMemo(
    () => assets.some((asset) => (asset.dividends12m ?? 0) > 0),
    [assets]
  );

  const sectors = useMemo(
    () =>
      [...new Set(assets.map((asset) => asset.sector).filter(Boolean))].sort() as string[],
    [assets]
  );

  const rows = useMemo<CeilingRow[]>(() => {
    const payout = payoutPercent / 100;
    const requiredReturn = requiredReturnPercent / 100;
    const growth = growthPercent / 100;

    return assets
      .filter((asset) => asset.assetType === kind)
      .map((asset) => {
      const override = overrideByTicker.get(asset.ticker);
      const projection = buildCeilingProjection({
        price: asset.price,
        reportedProfit: asset.netIncome,
        // Ajuste da empresa vence o slider: o slider é o padrão da casa.
        manualProfit: override?.manualProfit ?? null,
        sharesOutstanding: asset.sharesOutstanding,
        bookValuePerShare: asset.vpa,
        payout: override?.payout ?? payout,
      });

      const columns =
        asset.assetType === 'fii'
          ? buildFiiColumns(asset, fiiYieldPercent / 100)
          : buildColumns(method, projection, asset, requiredReturn, growth, bazinBase);
      const ceiling = columns.find((column) => column.strong)?.value ?? null;

      const tradedValue = (asset.volume ?? 0) * (asset.price ?? 0);
      const priceEarnings =
        asset.price !== null && projection.eps !== null && projection.eps > 0
          ? asset.price / projection.eps
          : null;

      const paidYield =
        asset.price !== null && asset.price > 0 && asset.dividends12m !== null
          ? asset.dividends12m / asset.price
          : null;

      // Quando existe mediana histórica, ela decide: comparar o lucro de agora
      // com o que a própria empresa costuma dar é bem mais honesto que o P/L.
      // Sem mediana, cai no proxy antigo.
      const deviation = profitDeviation(
        projection.profitUsed,
        asset.netIncomeMedian,
        asset.netIncomeMedianQuarters
      );
      const hasAtypicalProfit =
        asset.assetType === 'stock' &&
        (asset.netIncomeMedian !== null
          ? deviation !== null
          : priceEarnings !== null && priceEarnings < OUTLIER_PRICE_EARNINGS);

      // Dividendo alto demais denuncia evento extraordinário em qualquer ativo.
      const isOutlier =
        (paidYield !== null && paidYield > OUTLIER_DIVIDEND_YIELD) || hasAtypicalProfit;

      return {
        asset,
        projection,
        isOutlier,
        profitDeviation: deviation,
        isLiquid: tradedValue >= MIN_DAILY_TRADED,
        override,
        columns,
        ceiling,
        margin: safetyMargin(ceiling, asset.price),
      };
    });
  }, [
    fiiYieldPercent,
    assets,
    kind,
    payoutPercent,
    requiredReturnPercent,
    growthPercent,
    method,
    bazinBase,
    overrideByTicker,
  ]);

  const illiquidCount = useMemo(() => rows.filter((row) => !row.isLiquid).length, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toUpperCase();
    let universe = onlyLiquid ? rows.filter((row) => row.isLiquid) : rows;
    if (sector !== 'all') {
      universe = universe.filter((row) => row.asset.sector === sector);
    }
    if (onlyOwned) {
      universe = universe.filter((row) => owned.has(row.asset.ticker));
    }
    if (onlyBelowCeiling) {
      universe = universe.filter((row) => row.margin !== null && row.margin >= 0);
    }
    // Sem teto no método escolhido não há linha pra mostrar: a empresa pode
    // estar no prejuízo, ou só ter dividendo gravado e não o balanço.
    universe = universe.filter((row) => row.ceiling !== null);
    const matching = term
      ? universe.filter(
          ({ asset }) =>
            asset.ticker.includes(term) || asset.name.toUpperCase().includes(term)
        )
      : universe;

    if (sortKey === 'size') return matching;

    return [...matching].sort((a, b) => {
      if (sortKey === 'ticker') return a.asset.ticker.localeCompare(b.asset.ticker);
      // Empresa sem teto (prejuízo ou dado faltando) desce pro fim da lista.
      if (a.margin === null) return b.margin === null ? 0 : 1;
      if (b.margin === null) return -1;
      // Quem está marcado como atípico vai depois de quem não está, mesmo com
      // margem maior. Sem isso o topo do ranking é só distorção: o VCJR11
      // amortizou R$ 165 por cota em dois meses (cota de R$ 69) e a conta
      // devolvia margem de +4.080% — número real, evento que não se repete.
      // A linha continua na tabela, achável pela busca; ela só não lidera.
      if (a.isOutlier !== b.isOutlier) return a.isOutlier ? 1 : -1;
      return b.margin - a.margin;
    });
  }, [rows, search, sortKey, onlyLiquid, sector, onlyOwned, owned, onlyBelowCeiling]);

  const shown = filtered.slice(0, visible);
  const withoutCeiling = rows.filter((row) => row.ceiling === null).length;
  const latestBalance = useMemo(() => latestReferenceDate(assets), [assets]);
  const activeMethod = METHODS.find((item) => item.key === method)!;
  const headers = shown[0]?.columns.map((column) => column.label) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex w-full gap-1 rounded-full bg-surface p-1 shadow-soft sm:w-auto sm:self-start">
        {([
          { key: 'stock', label: 'Ações' },
          // "Fundos" e não "Fundos imobiliários": a aba abriga Fiagro e FI-Infra
            // também, e cada linha diz qual é qual no selo.
            { key: 'fii', label: 'Fundos' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setKind(key);
              // Bazin e Gordon não existem pra FII; volta pro método padrão.
              setMethod('projected');
              setEditingTicker(null);
              setSector('all');
              setVisible(PAGE_SIZE);
            }}
            aria-pressed={kind === key}
            className={`flex-1 whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-bold transition-colors sm:flex-none ${
              kind === key
                ? 'bg-primary-wash text-primary-deep'
                : 'text-muted-foreground hover:text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {kind === 'fii' && <FiiIntro hasData={rows.length > 0} />}

      <nav
        aria-label="Método de cálculo"
        className={`flex-wrap gap-2 ${kind === 'fii' ? 'hidden' : 'flex'}`}
      >
        {METHODS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setMethod(item.key);
              setEditingTicker(null);
              setVisible(PAGE_SIZE);
            }}
            aria-current={method === item.key ? 'true' : undefined}
            className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${
              method === item.key
                ? 'bg-primary-surface text-primary-surface-foreground shadow-soft'
                : 'border border-border bg-surface text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {kind === 'stock' && <p className="micro-hint">{activeMethod.hint}</p>}

      {method === 'bazin' && kind === 'stock' && !hasDividendData ? (
        <BazinUnavailable />
      ) : rows.length === 0 ? null : (
        <>
          <section className="card-lg flex flex-col gap-5">
            {kind === 'stock' && METHODS_WITH_PAYOUT.includes(method) && (
              <div>
                <label htmlFor="payout" className="micro-label">
                  Payout — parcela do lucro distribuída
                </label>
                <p className="micro-hint">
                  Percentual do lucro destinado a dividendos. Quanto maior o
                  payout, maior o preço teto resultante.
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <input
                    id="payout"
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={payoutPercent}
                    onChange={(event) => setPayoutPercent(Number(event.target.value))}
                    className="h-6 w-full cursor-pointer accent-primary"
                  />
                  <span className="num w-20 flex-none rounded-panel bg-primary-wash py-2 text-center text-lg font-extrabold text-primary-deep">
                    {payoutPercent}%
                  </span>
                </div>
              </div>
            )}

            {kind === 'fii' && (
              <div>
                <label htmlFor="fii-yield" className="micro-label">
                  Rendimento anual desejado
                </label>
                <p className="micro-hint">
                  Dividend yield alvo. Quanto maior o rendimento exigido, menor
                  o preço teto resultante.
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <input
                    id="fii-yield"
                    type="range"
                    min={FII_YIELD_RANGE.min}
                    max={FII_YIELD_RANGE.max}
                    step={0.5}
                    value={fiiYieldPercent}
                    onChange={(event) => setFiiYieldPercent(Number(event.target.value))}
                    className="h-6 w-full cursor-pointer accent-primary"
                  />
                  <span className="num w-24 flex-none rounded-panel bg-primary-wash py-2 text-center text-lg font-extrabold text-primary-deep">
                    {fiiYieldPercent.toFixed(1).replace('.', ',')}%
                  </span>
                </div>
              </div>
            )}

            {kind === 'stock' && method === 'bazin' && (
              <div>
                <span className="micro-label">Base de cálculo do dividendo</span>
                <p className="micro-hint">
                  O método original de Décio Bazin usa a média de vários anos —
                  um único exercício pode não representar a distribuição
                  recorrente.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    { key: '12m', label: 'Últimos 12 meses' },
                    { key: '5y', label: 'Média de 5 anos' },
                  ] as const).map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setBazinBase(key)}
                      aria-pressed={bazinBase === key}
                      className={`rounded-full px-5 py-2 text-sm font-bold transition-colors ${
                        bazinBase === key
                          ? 'bg-primary-wash text-primary-deep'
                          : 'border border-border text-muted-foreground hover:border-primary hover:text-primary'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kind === 'stock' && method === 'gordon' && (
              <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
                <PercentField
                  label="Retorno exigido ao ano"
                  hint="Retorno mínimo aceito para assumir o risco de renda variável."
                  value={requiredReturnPercent}
                  min={1}
                  max={30}
                  onChange={setRequiredReturnPercent}
                />
                <PercentField
                  label="Crescimento anual do dividendo"
                  hint="Taxa de crescimento anual estimada para o dividendo."
                  value={growthPercent}
                  min={0}
                  max={20}
                  onChange={setGrowthPercent}
                />
                {growthPercent >= requiredReturnPercent && (
                  <p className="text-sm font-semibold text-negative sm:col-span-2">
                    O crescimento deve ser menor que o retorno exigido: caso
                    contrário a fórmula de Gordon tende ao infinito e não produz
                    preço teto.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">Buscar empresa</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                  placeholder="Buscar por ticker ou nome (ex.: ITSA4)"
                  className="field"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">Ordenar por</span>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="field sm:w-56"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                    <option key={key} value={key}>
                      {SORT_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
              <label className="flex flex-col gap-1.5">
                <span className="sr-only">Filtrar por setor</span>
                <select
                  value={sector}
                  onChange={(event) => {
                    setSector(event.target.value);
                    setVisible(PAGE_SIZE);
                  }}
                  className="field"
                >
                  <option value="all">Todos os setores</option>
                  {sectors.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOnlyBelowCeiling((current) => !current);
                    setVisible(PAGE_SIZE);
                  }}
                  aria-pressed={onlyBelowCeiling}
                  className={`rounded-panel px-5 py-3 text-sm font-bold transition-colors ${
                    onlyBelowCeiling
                      ? 'bg-primary-surface text-primary-surface-foreground'
                      : 'border border-border bg-surface text-muted-foreground hover:border-primary hover:text-primary'
                  }`}
                >
                  Abaixo do teto
                </button>

                {owned.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setOnlyOwned((current) => !current);
                      setVisible(PAGE_SIZE);
                    }}
                    aria-pressed={onlyOwned}
                    className={`rounded-panel px-5 py-3 text-sm font-bold transition-colors ${
                      onlyOwned
                        ? 'bg-primary-surface text-primary-surface-foreground'
                        : 'border border-border bg-surface text-muted-foreground hover:border-primary hover:text-primary'
                    }`}
                  >
                    Em carteira ({owned.size})
                  </button>
                )}
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-panel bg-background p-4">
              <input
                type="checkbox"
                checked={onlyLiquid}
                onChange={(event) => {
                  setOnlyLiquid(event.target.checked);
                  setVisible(PAGE_SIZE);
                }}
                className="mt-0.5 size-5 flex-none accent-primary"
              />
              <span>
                <span className="block text-sm font-bold">
                  Exibir apenas ativos com liquidez
                </span>
                <span className="micro-hint">
                  {illiquidCount}{' '}
                  {kind === 'fii'
                    ? `fundo${illiquidCount === 1 ? '' : 's'}`
                    : `empresa${illiquidCount === 1 ? '' : 's'}`}{' '}
                  têm liquidez muito baixa. A cotação exibida pode estar
                  desatualizada, o que distorce o preço teto e a margem.
                </span>
              </span>
            </label>

            <p className="micro-hint border-t border-border pt-4">
              {kind === 'fii' ? (
                <>
                  <strong className="font-bold text-foreground">Distribuído em 12m</strong>{' '}
                  é o total pago por cota no período;{' '}
                  <strong className="font-bold text-foreground">por mês</strong> é
                  esse valor dividido por doze; e o{' '}
                  <strong className="font-bold text-foreground">teto</strong>{' '}
                  resulta da divisão pelo rendimento anual definido acima. O
                  valor não é arredondado: em cotas de preço baixo, o
                  arredondamento distorceria o resultado.
                </>
              ) : (
                <>
                  <MethodLegend method={method} />
                  {latestBalance && (
                    <> Os números vêm do balanço mais recente na CVM, de {latestBalance}.</>
                  )}
                </>
              )}
            </p>
          </section>

          <p className="micro-hint">
            {filtered.length}{' '}
            {kind === 'fii'
              ? `fundo${filtered.length === 1 ? '' : 's'}`
              : `empresa${filtered.length === 1 ? '' : 's'}`}{' '}
            na conta.
            {withoutCeiling > 0 && (
              <>
                {' '}
                Outr{withoutCeiling === 1 ? 'a' : 'as'} {withoutCeiling} fic
                {withoutCeiling === 1 ? 'ou' : 'aram'} de fora por falta do dado
                que este método exige.
              </>
            )}
          </p>

          <div className="hidden overflow-x-auto rounded-card bg-surface shadow-soft sm:block">
            <table className="w-full min-w-[46rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                    Empresa
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                    Cotação
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                    30 dias
                  </th>
                  {headers.map((label, index) => (
                    <th
                      key={label}
                      className={`px-4 py-3 text-right text-xs font-extrabold uppercase tracking-[0.08em] ${
                        shown[0]?.columns[index]?.strong
                          ? 'text-primary'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                    Margem de segurança
                  </th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Ajustar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const { asset, isOutlier, profitDeviation: deviation, isLiquid, override, columns, margin } =
    row;
                  return (
                    <Fragment key={asset.ticker}>
                      <tr className="border-b border-border/70 hover:bg-primary-wash/50">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2.5">
                            <AssetLogo ticker={asset.ticker} url={asset.logoUrl} size={30} />
                            <span className="min-w-0">
                              <Link
                                href={`/ativo/${asset.ticker}`}
                                className="font-extrabold text-primary-deep hover:underline"
                              >
                                {asset.ticker}
                              </Link>
                              <span className="block max-w-[11rem] truncate text-xs font-medium text-muted-foreground">
                                {friendlyName(asset.name, asset.ticker)}
                              </span>
                            </span>
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {asset.fundType && asset.fundType !== 'FII' && (
                              <FundTypeBadge type={asset.fundType} />
                            )}
                            {owned.has(asset.ticker) && <OwnedBadge />}
                            {!isLiquid && <IlliquidBadge />}
                            {isOutlier && <OutlierBadge kind={asset.assetType} deviation={deviation} />}
                            {override && <OverrideBadge isGlobal={override.isGlobal} />}
                          </span>
                        </td>
                        <td className="num px-4 py-3 text-right font-semibold">
                          {asset.price === null ? '—' : formatBRL(asset.price)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="flex justify-center">
                            <Sparkline values={asset.priceHistory ?? []} />
                          </span>
                        </td>
                        {columns.map((column) => (
                          <td
                            key={column.label}
                            className={`num px-4 py-3 text-right ${
                              column.strong
                                ? 'font-bold text-primary-deep'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {column.value === null ? '—' : formatBRL(column.value)}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right">
                          <MarginChip margin={margin} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingTicker((current) =>
                                current === asset.ticker ? null : asset.ticker
                              )
                            }
                            className="btn-ghost whitespace-nowrap"
                          >
                            {editingTicker === asset.ticker ? 'Fechar' : 'Ajustar'}
                          </button>
                        </td>
                      </tr>
                      {editingTicker === asset.ticker && (
                        <tr className="border-b border-border/70">
                          <td colSpan={5 + columns.length} className="px-4 pb-4">
                            <OverrideForm
                              asset={asset}
                              override={override}
                              reportedEps={reportedEps(asset)}
                              defaultPayoutPercent={payoutPercent}
                              isCurator={isCurator}
                              onDone={() => setEditingTicker(null)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col gap-3 sm:hidden">
            {shown.map((row) => {
              const { asset, isOutlier, profitDeviation: deviation, isLiquid, override, columns, margin } =
    row;
              const headline = columns.find((column) => column.strong);
              const cells = columns.filter((column) => column !== headline);
              return (
                <li key={asset.ticker} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AssetLogo ticker={asset.ticker} url={asset.logoUrl} size={36} />
                      <div className="min-w-0">
                        <Link
                          href={`/ativo/${asset.ticker}`}
                          className="text-lg font-extrabold text-primary-deep"
                        >
                          {asset.ticker}
                        </Link>
                        <p className="truncate text-xs font-medium text-muted-foreground">
                          {friendlyName(asset.name, asset.ticker)}
                        </p>
                      </div>
                    </div>
                    <MarginChip margin={margin} />
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-4 rounded-panel bg-primary-wash px-4 py-3">
                    <div>
                      <p className="micro-label">{headline?.label ?? 'Preço teto'}</p>
                      <p className="num text-2xl font-extrabold leading-tight text-primary-deep">
                        {headline?.value == null ? '—' : formatBRL(headline.value)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="micro-label">Hoje custa</p>
                      <p className="num text-lg font-bold">
                        {asset.price === null ? '—' : formatBRL(asset.price)}
                      </p>
                      {asset.priceHistory && asset.priceHistory.length > 1 && (
                        <span className="mt-1 flex justify-end">
                          <Sparkline values={asset.priceHistory} width={64} height={20} />
                        </span>
                      )}
                    </div>
                  </div>

                  <dl
                    className={`mt-3 grid gap-2 text-center ${
                      cells.length >= 4 ? 'grid-cols-4' : 'grid-cols-2'
                    }`}
                  >
                    {cells.map((cell) => (
                      <Cell key={cell.label} label={cell.label} value={cell.value} />
                    ))}
                  </dl>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap gap-1.5">
{asset.fundType && asset.fundType !== 'FII' && (
                        <FundTypeBadge type={asset.fundType} />
                      )}
                                            {owned.has(asset.ticker) && <OwnedBadge />}
                      {!isLiquid && <IlliquidBadge />}
                      {isOutlier && <OutlierBadge kind={asset.assetType} deviation={deviation} />}
                      {override && <OverrideBadge isGlobal={override.isGlobal} />}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingTicker((current) =>
                          current === asset.ticker ? null : asset.ticker
                        )
                      }
                      className="btn-ghost ml-auto"
                    >
                      {editingTicker === asset.ticker ? 'Fechar' : 'Ajustar'}
                    </button>
                  </div>

                  {editingTicker === asset.ticker && (
                    <div className="mt-3">
                      <OverrideForm
                        asset={asset}
                        override={override}
                        reportedEps={reportedEps(asset)}
                        defaultPayoutPercent={payoutPercent}
                        isCurator={isCurator}
                        onDone={() => setEditingTicker(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {visible < filtered.length && (
            <button
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="btn-ghost mx-auto"
            >
              Ver mais {Math.min(PAGE_SIZE, filtered.length - visible)} empresas
            </button>
          )}

          {kind === 'fii' ? (
            <InfoNote title="Método de cálculo">
              Soma das distribuições por cota dos últimos 12 meses dividida pelo
              rendimento anual desejado. Com o parâmetro em{' '}
              {fiiYieldPercent.toFixed(1).replace('.', ',')}%, um fundo que
              distribuiu R$ 12,00 por cota no período tem preço teto de{' '}
              {formatBRL(12 / (fiiYieldPercent / 100))}. Acima desse valor, a
              mesma distribuição resulta em rendimento menor sobre o capital
              aplicado.
            </InfoNote>
          ) : (
            <MethodExplainer
              method={method}
              payoutPercent={payoutPercent}
              requiredReturnPercent={requiredReturnPercent}
              growthPercent={growthPercent}
            />
          )}
        </>
      )}

      <p className="text-xs font-medium text-muted-foreground">
        Conteúdo educacional. Não constitui recomendação de compra ou venda. O
        lucro considerado é o do último balanço publicado e pode não se repetir;
        o preço teto é uma referência de estudo, sem garantia de resultado.
      </p>
    </div>
  );
}

/**
 * FII não tem lucro por ação: o teto sai do rendimento distribuído nos últimos
 * 12 meses dividido pelo yield desejado — a mesma conta do Bazin, e por isso
 * aqui não existe payout nem escolha de método.
 */
/**
 * Colunas de FII.
 *
 * Um teto só, comandado pelo slider — é o formato da calculadora da Comunidade
 * da Riqueza, que entra com o rendimento mensal e um yield desejado. Os três
 * tetos fixos de 6/8/10 vieram de ação e distorciam aqui: fundo que paga 12%
 * comparado com uma régua de 6% aparecia com margem de +120% em tudo, o que não
 * separa fundo nenhum de fundo nenhum.
 */
function buildFiiColumns(asset: CeilingAsset, targetYield: number): MethodColumn[] {
  const monthly = asset.dividends12m === null ? null : asset.dividends12m / 12;
  return [
    { label: 'Distribuído em 12m', value: asset.dividends12m },
    { label: 'Por mês', value: monthly },
    {
      label: `Teto ${formatRatio(targetYield)}`,
      value: fiiCeiling(asset.dividends12m, targetYield),
      strong: true,
    },
  ];
}

/** Monta as colunas numéricas do método escolhido, na ordem em que aparecem. */
type BazinBase = '12m' | '5y';

function buildColumns(
  method: MethodKey,
  projection: CeilingProjection,
  asset: CeilingAsset,
  requiredReturn: number,
  growth: number,
  bazinBase: BazinBase
): MethodColumn[] {
  if (method === 'graham') {
    return [
      { label: 'LPA', value: projection.eps },
      { label: 'VPA', value: asset.vpa },
      { label: 'Valor justo', value: projection.graham, strong: true },
    ];
  }

  if (method === 'bazin') {
    // Bazin não projeta nada: usa o que já foi depositado na conta de quem tinha
    // a ação. A base de 5 anos é a do método original — ele desconfiava de um
    // ano bom isolado.
    const base = bazinBase === '5y' ? asset.dividends5yAvg : asset.dividends12m;
    return [
      {
        // O rótulo conta quantos anos ENTRARAM na média: `dividends_years` já
        // vinha do banco e nenhum componente lia. 91 tickers têm 3 ou 4 anos de
        // histórico e apareciam rotulados como 5.
        label:
          bazinBase === '5y'
            ? `Média anual (${asset.dividendsYears ?? 5}a)`
            : 'Pago em 12m',
        value: base,
      },
      ...TARGET_YIELDS.map((targetYield) => ({
        label: `Teto ${formatRatio(targetYield)}`,
        value: bazinCeiling(base, targetYield),
        strong: true,
      })),
    ];
  }

  if (method === 'gordon') {
    // D₁ é o dividendo do ANO QUE VEM: o de hoje já corrigido pelo crescimento.
    const nextDividend =
      projection.dps === null ? null : projection.dps * (1 + growth);
    return [
      { label: 'DPA', value: projection.dps },
      { label: 'DPA em 1 ano', value: nextDividend },
      {
        label: 'Preço teto',
        value: gordonCeiling(nextDividend, requiredReturn, growth),
        strong: true,
      },
    ];
  }

  return [
    { label: 'LPA', value: projection.eps },
    { label: 'DPA', value: projection.dps },
    ...projection.ceilings.map(({ targetYield, ceiling }) => ({
      label: `Teto ${formatRatio(targetYield)}`,
      value: ceiling,
      strong: true,
    })),
  ];
}

function MethodLegend({ method }: { method: MethodKey }) {
  if (method === 'bazin') {
    return (
      <>
        <strong className="font-bold text-foreground">Pagou em 12m</strong> é o
        que a empresa realmente depositou por ação no último ano; o{' '}
        <strong className="font-bold text-foreground">teto</strong> é esse valor
        dividido pelo retorno que você quer receber.
      </>
    );
  }

  if (method === 'graham') {
    return (
      <>
        <strong className="font-bold text-foreground">LPA</strong> é o lucro que
        cabe em cada ação;{' '}
        <strong className="font-bold text-foreground">VPA</strong> é o patrimônio
        que cabe em cada ação;{' '}
        <strong className="font-bold text-foreground">valor justo</strong> é a
        média entre os dois que Graham considerava o limite de pagamento.
      </>
    );
  }

  if (method === 'gordon') {
    return (
      <>
        <strong className="font-bold text-foreground">DPA</strong> é o dividendo
        por ação de hoje;{' '}
        <strong className="font-bold text-foreground">DPA em 1 ano</strong> é ele
        já crescido; o{' '}
        <strong className="font-bold text-foreground">preço teto</strong> é esse
        dividendo dividido pela diferença entre o retorno que você exige e o
        crescimento.
      </>
    );
  }

  return (
    <>
      <strong className="font-bold text-foreground">LPA</strong> é o lucro que
      cabe em cada ação;{' '}
      <strong className="font-bold text-foreground">DPA</strong> é quanto disso
      deve virar dividendo;{' '}
      <strong className="font-bold text-foreground">margem de segurança</strong>{' '}
      é o desconto da cotação atual sobre o teto de 6% — com 40% de margem, a
      cotação está 40% abaixo do preço teto.
    </>
  );
}

interface MethodExplainerProps {
  method: MethodKey;
  payoutPercent: number;
  requiredReturnPercent: number;
  growthPercent: number;
}

function MethodExplainer({
  method,
  payoutPercent,
  requiredReturnPercent,
  growthPercent,
}: MethodExplainerProps) {
  if (method === 'bazin') {
    return (
      <InfoNote title="Método de cálculo">
        Soma dos proventos pagos por ação nos últimos 12 meses, dividida pelo
        rendimento anual desejado. Para 6% ao ano, o teto é esse total dividido
        por 0,06. O método de Décio Bazin dispensa projeção de lucro e considera
        apenas distribuições já realizadas.
      </InfoNote>
    );
  }

  if (method === 'graham') {
    return (
      <InfoNote title="Método de cálculo">
        Benjamin Graham estabeleceu dois limites: até 15 vezes o lucro e até 1,5
        vez o patrimônio. O produto dos dois resulta em 22,5, e o valor justo é
        a raiz de 22,5 × LPA × VPA. O método avalia lucro e patrimônio atuais,
        não a distribuição de dividendos.
      </InfoNote>
    );
  }

  if (method === 'gordon') {
    return (
      <InfoNote title="Método de cálculo">
        Supõe crescimento perpétuo de {growthPercent}% ao ano no dividendo. O
        preço teto é o dividendo do próximo período dividido pela diferença
        entre o retorno exigido ({requiredReturnPercent}%) e esse crescimento.
        Quanto mais próximas as duas taxas, maior o resultado — o que torna a
        estimativa de crescimento o parâmetro mais sensível do método.
      </InfoNote>
    );
  }

  return (
    <InfoNote title="Método de cálculo">
      O lucro é dividido pelo número de ações, resultando no LPA, e sobre ele
      aplica-se o payout de {payoutPercent}% para obter o dividendo por ação.
      Para um rendimento de 6% ao ano, o teto é esse dividendo dividido por
      0,06. Acima desse preço, a mesma distribuição rende menos sobre o capital
      aplicado.
    </InfoNote>
  );
}

/**
 * Bazin parte dos dividendos JÁ PAGOS, e essa é a única informação da tela que
 * nenhuma das fontes serve no plano gratuito: a bolsai devolve 403 em
 * `/dividends` e a brapi tirou dividendos do free (medido em 2026-08-04, vale
 * até pros tickers de sandbox). Sem o dado, a aba conta a verdade em vez de
 * inventar número.
 */
/** Enquanto o cron dos FIIs não roda, a aba precisa dizer por que está vazia. */
function FiiIntro({ hasData }: { hasData: boolean }) {
  if (hasData) {
    return (
      <p className="micro-hint">
        Fundos listados não apuram lucro por cota. O teto é calculado sobre as
        distribuições realizadas nos últimos 12 meses.
      </p>
    );
  }
  return (
    <InfoNote title="Dados em carregamento">
      O catálogo de fundos já está disponível, mas as distribuições por cota
      ainda não foram sincronizadas. A lista com o preço teto de cada fundo
      aparece após a próxima sincronização.
    </InfoNote>
  );
}

function BazinUnavailable() {
  return (
    <div className="card-lg flex flex-col gap-4">
      <InfoNote title="Método indisponível">
        O método de Bazin utiliza os proventos efetivamente pagos por ação nos
        últimos 12 meses, divididos pelo rendimento desejado. Esse histórico de
        pagamentos depende de uma fonte de dados ainda não habilitada nesta
        instalação.
      </InfoNote>
      <p className="micro-hint">
        O método <strong className="font-bold text-foreground">Projetado</strong>{' '}
        chega a uma estimativa equivalente partindo do lucro em vez do provento
        já pago, e o{' '}
        <strong className="font-bold text-foreground">Graham</strong> não depende
        de dividendo.
      </p>
    </div>
  );
}

interface PercentFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function PercentField({ label, hint, value, min, max, onChange }: PercentFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <span className="micro-hint">{hint}</span>
      <span className="mt-1 flex items-center gap-2 rounded-panel border border-border bg-surface px-4 focus-within:border-primary">
        <input
          type="number"
          min={min}
          max={max}
          step={0.5}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(Number(event.target.value) || 0)}
          className="num w-full bg-transparent py-3 text-base outline-none"
        />
        <span className="text-sm font-bold text-muted-foreground">%</span>
      </span>
    </label>
  );
}

function MarginChip({ margin }: { margin: number | null }) {
  if (margin === null) {
    return <span className="chip chip-neutral">sem teto</span>;
  }
  return (
    <span
      className={`chip ${margin >= 0 ? 'chip-up' : 'chip-down'}`}
      title={
        margin >= 0
          ? 'Desconto da cotação atual sobre o preço teto.'
          : 'A cotação está acima do preço teto — não há margem de segurança.'
      }
    >
      {formatRatioSigned(margin)}
    </span>
  );
}

/**
 * Diz o que o fundo é quando não é FII.
 *
 * Fiagro e FI-Infra dividem a aba e a conta de preço teto com os fundos
 * imobiliários, mas não são fundos imobiliários — e a plataforma é educativa.
 * FII não leva selo: seria ruído em 9 de cada 10 linhas.
 */
function FundTypeBadge({ type }: { type: string }) {
  return (
    <span
      className="inline-block rounded-full border border-border px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-muted-foreground"
      title={
        type === 'Fiagro'
          ? 'Fiagro: fundo do agronegócio. Distribui renda periódica; os ativos são do setor agrícola, não imobiliários.'
          : 'FI-Infra: fundo de infraestrutura. Distribui renda periódica e costuma ter isenção de imposto de renda para pessoa física.'
      }
    >
      {type}
    </span>
  );
}

function OwnedBadge() {
  return (
    <span
      className="inline-block rounded-full bg-primary-surface px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-primary-surface-foreground"
      title="Ativo presente na sua carteira."
    >
      você tem
    </span>
  );
}

function OverrideBadge({ isGlobal }: { isGlobal: boolean }) {
  return (
    <span
      className="inline-block rounded-full bg-primary-tint px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-primary-deep"
      title={
        isGlobal
          ? 'A Beca ajustou o payout ou o lucro desta empresa para todas as contas.'
          : 'Esta linha usa o payout e o lucro que você definiu.'
      }
    >
      {isGlobal ? 'ajuste da Beca' : 'seu ajuste'}
    </span>
  );
}

/** LPA do balanço, ignorando o ajuste — é a régua que o formulário mostra. */
function reportedEps(asset: CeilingAsset): number | null {
  if (asset.netIncome === null || !asset.sharesOutstanding) return null;
  return asset.netIncome / asset.sharesOutstanding;
}

function IlliquidBadge() {
  return (
    <span
      className="inline-block rounded-full bg-negative-tint px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-negative-deep"
      title="Baixa liquidez: a cotação pode estar desatualizada e distorcer o preço teto."
    >
      pouco negociada
    </span>
  );
}

const BADGE_CLASS =
  'inline-block rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-accent-foreground';

function OutlierBadge({
  kind,
  deviation,
}: {
  kind: MarketAssetType;
  deviation: ProfitDeviation;
}) {
  if (kind === 'fii') {
    return (
      <span
        className={BADGE_CLASS}
        title="Distribuição muito acima da média histórica. Em geral corresponde a amortização de capital ou venda de ativo — eventos que não se repetem."
      >
        rendimento atípico
      </span>
    );
  }

  // Lucro deprimido também distorce, só que pro outro lado: o teto sai baixo
  // demais e a empresa parece cara quando não está. Dizer qual dos dois é o
  // caso poupa a usuária de adivinhar.
  if (deviation === 'low') {
    return (
      <span
        className={BADGE_CLASS}
        title="Lucro dos últimos 12 meses abaixo da metade da mediana histórica. O preço teto sai reduzido por esse motivo, e não por sobrepreço da ação."
      >
        lucro abaixo do normal
      </span>
    );
  }

  return (
    <span
      className={BADGE_CLASS}
      title={
        deviation === 'high'
          ? 'Lucro dos últimos 12 meses acima do dobro da mediana histórica. Projetar dividendo sobre esse valor infla o preço teto.'
          : 'Lucro do balanço fora do padrão histórico — pode conter venda de ativo ou crédito tributário não recorrente.'
      }
    >
      lucro atípico
    </span>
  );
}

function Cell({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-panel bg-background px-1 py-2">
      <dt className="text-[0.65rem] font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="num text-sm font-bold">
        {value === null ? '—' : formatBRL(value)}
      </dd>
    </div>
  );
}

/**
 * A CVM guarda a razão social gritada ("VALE S.A."); vira Title Case aqui.
 * FII costuma vir com o nome igual ao ticker — nesse caso não há o que exibir.
 */
function friendlyName(name: string, ticker?: string): string {
  if (ticker && name.toUpperCase() === ticker.toUpperCase()) return '';
  return name
    .toLowerCase()
    .replace(/(^|[\s(])([a-zà-ú])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .replace(/\bS\.?a\.?\b/gi, 'S.A.');
}

function latestReferenceDate(assets: CeilingAsset[]): string | null {
  const dates = assets
    .map((asset) => asset.referenceDate)
    .filter((date): date is string => Boolean(date))
    .sort();
  const latest = dates.at(-1);
  if (!latest) return null;
  const [year, month, day] = latest.split('-');
  return `${day}/${month}/${year}`;
}
