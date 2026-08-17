/**
 * Renda fixa: valor de curva e imposto.
 *
 * 100% função pura — sem rede e sem banco, como `ceiling-price.ts` e
 * `market-radar.ts`. Quem busca o CDI é `lib/bcb.ts`, e o fator acumulado
 * chega aqui pronto. É o que permite testar a conta sem subir nada.
 */

/** O que a aluna cadastra. Espelha `public.fixed_income_kind`. */
export type FixedIncomeKind =
  | 'cdb'
  | 'lci'
  | 'lca'
  | 'cri'
  | 'cra'
  | 'debenture'
  | 'poupanca';

/** Espelha `public.fixed_income_index`. */
export type FixedIncomeIndex = 'cdi' | 'prefixado';

/**
 * Quem é isento de IR.
 *
 * LCI e LCA são isentas para pessoa física por lei — é justamente o que faz
 * uma LCI de 95% do CDI render mais que um CDB de 105%. CRI e CRA também são
 * isentos; ficam de fora desta primeira versão porque não entraram no escopo,
 * mas a lista já os prevê para quando entrarem.
 */
const TAX_EXEMPT: ReadonlySet<FixedIncomeKind> = new Set([
  'lci',
  'lca',
  'cri',
  'cra',
  'poupanca',
]);

export function isTaxExempt(kind: FixedIncomeKind): boolean {
  return TAX_EXEMPT.has(kind);
}

/**
 * Tabela regressiva do IR sobre renda fixa tributada.
 *
 * A alíquota cai com o PRAZO DA APLICAÇÃO, contado em dias corridos desde o
 * aporte — não em dias úteis, e não no ano-calendário. Incide só sobre o
 * rendimento, nunca sobre o principal.
 */
const TAX_BRACKETS = [
  { upToDays: 180, rate: 0.225 },
  { upToDays: 360, rate: 0.2 },
  { upToDays: 720, rate: 0.175 },
  { upToDays: Infinity, rate: 0.15 },
] as const;

export function incomeTaxRate(kind: FixedIncomeKind, elapsedDays: number): number {
  if (isTaxExempt(kind)) return 0;
  const bracket = TAX_BRACKETS.find((item) => elapsedDays <= item.upToDays);
  return bracket?.rate ?? 0.15;
}

/** Dias corridos entre duas datas, sem hora. Negativo vira zero. */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86_400_000);
}

export interface CurveInput {
  principal: number;
  indexKind: FixedIncomeIndex;
  /** "110% do CDI" → 110. Ignorado em prefixado. */
  indexPercent: number | null;
  /** "12,5% ao ano" → 12.5. Ignorado em CDI puro. */
  ratePercent: number | null;
  /** Fator acumulado do CDI no período, já com o percentual aplicado por dia. */
  cdiFactor: number | null;
  /** Pregões no período — o expoente do prefixado é `dias/252`. */
  businessDays: number | null;
}

/**
 * Valor de curva: quanto o papel vale hoje seguindo a taxa contratada.
 *
 * É o saldo que a corretora mostra, e NÃO é preço de resgate antecipado.
 * Prefixado e IPCA+ oscilam com a marcação a mercado se vendidos antes do
 * vencimento; a curva ignora isso de propósito, porque é o número que a
 * pessoa reconhece. A tela precisa dizer isso — ver o card em `/carteira`.
 */
export function curveValue(input: CurveInput): number | null {
  if (!(input.principal > 0)) return null;

  if (input.indexKind === 'cdi') {
    if (input.cdiFactor === null || !Number.isFinite(input.cdiFactor)) return null;
    return input.principal * input.cdiFactor;
  }

  // Prefixado: juro anual capitalizado em dias ÚTEIS sobre 252, que é a
  // convenção da B3 — daí o `businessDays` vir da contagem de pregões do CDI
  // em vez de uma estimativa sobre dias corridos.
  if (input.ratePercent === null || input.businessDays === null) return null;
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0) return null;
  return input.principal * (1 + input.ratePercent / 100) ** (input.businessDays / 252);
}

export interface FixedIncomeValuation {
  /** Valor de curva hoje, antes do imposto. */
  grossValue: number;
  /** Valor de curva menos o principal. */
  grossYield: number;
  taxRate: number;
  taxDue: number;
  /** O que sobraria resgatando hoje: principal + rendimento líquido. */
  netValue: number;
  netYield: number;
  elapsedDays: number;
  /** Nulo quando não há vencimento (liquidez diária). Negativo já venceu. */
  daysToMaturity: number | null;
  /** Parou de render: passou do vencimento. */
  isMatured: boolean;
}

export interface ValuationInput extends CurveInput {
  kind: FixedIncomeKind;
  appliedOn: Date;
  maturesOn: Date | null;
  /** Injetado pra manter a função pura e o resultado testável. */
  now: Date;
}

/**
 * Papel vencido para de render.
 *
 * Sem isso o patrimônio infla sozinho para sempre: um CDB que venceu em 2024
 * continuaria acumulando CDI até hoje. Quem chama precisa buscar o CDI só até
 * a data de vencimento — esta função não corrige o fator, ela sinaliza.
 */
export function valuate(input: ValuationInput): FixedIncomeValuation | null {
  const gross = curveValue(input);
  if (gross === null) return null;

  const isMatured = input.maturesOn !== null && input.maturesOn <= input.now;
  const endDate = isMatured ? input.maturesOn! : input.now;

  const elapsedDays = daysBetween(input.appliedOn, endDate);
  const grossYield = gross - input.principal;
  const taxRate = incomeTaxRate(input.kind, elapsedDays);
  // O imposto morde só o rendimento. Rendimento negativo (não acontece em
  // curva, mas o tipo permite) não gera imposto a pagar.
  const taxDue = grossYield > 0 ? grossYield * taxRate : 0;

  return {
    grossValue: gross,
    grossYield,
    taxRate,
    taxDue,
    netValue: gross - taxDue,
    netYield: grossYield - taxDue,
    elapsedDays,
    daysToMaturity:
      input.maturesOn === null
        ? null
        : Math.ceil((input.maturesOn.getTime() - input.now.getTime()) / 86_400_000),
    isMatured,
  };
}

export const KIND_LABEL: Record<FixedIncomeKind, string> = {
  cdb: 'CDB',
  lci: 'LCI',
  lca: 'LCA',
  cri: 'CRI',
  cra: 'CRA',
  debenture: 'Debênture',
  poupanca: 'Poupança',
};
