import type {
  FixedIncomeIndex,
  FixedIncomeKind,
  FixedIncomeValuation,
} from '@/lib/fixed-income';

/** Linha crua de `public.fixed_income_positions`. */
export interface FixedIncomeRow {
  id: string;
  user_id: string;
  name: string;
  kind: FixedIncomeKind;
  principal: number;
  applied_on: string;
  matures_on: string | null;
  index_kind: FixedIncomeIndex;
  index_percent: number | null;
  rate_percent: number | null;
  created_at: string;
  updated_at: string;
}

/** A mesma posição já avaliada, pronta pra tela. */
export interface FixedIncomeHolding {
  id: string;
  name: string;
  kind: FixedIncomeKind;
  principal: number;
  appliedOn: string;
  maturesOn: string | null;
  indexKind: FixedIncomeIndex;
  indexPercent: number | null;
  ratePercent: number | null;
  /**
   * Nulo quando o CDI não respondeu. A tela mostra "dado indisponível" em vez
   * de exibir só o principal como se fosse o valor de hoje — mesma regra de
   * degradação do preço de mercado.
   */
  valuation: FixedIncomeValuation | null;
}

export interface FixedIncomeSummary {
  holdings: FixedIncomeHolding[];
  /** Soma do que entrou. */
  totalPrincipal: number;
  /** Soma do valor de curva bruto, só do que foi possível calcular. */
  totalGross: number;
  /** O que sobraria resgatando tudo hoje, já com IR. */
  totalNet: number;
  /** Alguma posição ficou sem cálculo — o total está incompleto. */
  hasIncomplete: boolean;
}
