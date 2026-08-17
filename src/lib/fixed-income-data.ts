import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCdiAccrual } from '@/lib/bcb';
import { valuate } from '@/lib/fixed-income';
import type {
  FixedIncomeHolding,
  FixedIncomeRow,
  FixedIncomeSummary,
} from '@/types/fixed-income';

/**
 * Data pura (`AAAA-MM-DD`) fatiada, nunca convertida.
 *
 * `new Date("2026-08-01")` é meia-noite UTC e vira 31/07 em São Paulo — é o
 * defeito que já mandou 73% dos proventos pro mês errado. Aqui doeria no
 * prazo do IR e na contagem de dias até o vencimento.
 */
function parseDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date);
}

/**
 * Posições de renda fixa da usuária, já avaliadas.
 *
 * Uma chamada ao BCB por posição, porque cada uma tem período próprio — mas
 * `lib/bcb.ts` usa `next: { revalidate }` de 6h, então intervalos repetidos
 * saem do cache. A série só muda uma vez por dia.
 */
export async function fetchFixedIncome(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<FixedIncomeSummary> {
  const { data } = await supabase
    .from('fixed_income_positions')
    .select('*')
    .order('applied_on', { ascending: false });

  const rows = (data ?? []) as FixedIncomeRow[];

  const holdings = await Promise.all(
    rows.map(async (row): Promise<FixedIncomeHolding> => {
      const appliedOn = parseDay(row.applied_on);
      const maturesOn = row.matures_on ? parseDay(row.matures_on) : null;

      // Papel vencido para de render: o CDI é buscado só até o vencimento.
      // Sem esse corte, um CDB de 2024 continuaria acumulando até hoje e o
      // patrimônio inflaria sozinho.
      const until = maturesOn && maturesOn < now ? maturesOn : now;

      const accrual = await getCdiAccrual(
        appliedOn,
        until,
        row.index_kind === 'cdi' ? Number(row.index_percent ?? 100) : 0
      );

      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        principal: Number(row.principal),
        appliedOn: row.applied_on,
        maturesOn: row.matures_on,
        indexKind: row.index_kind,
        indexPercent: row.index_percent === null ? null : Number(row.index_percent),
        ratePercent: row.rate_percent === null ? null : Number(row.rate_percent),
        valuation: valuate({
          principal: Number(row.principal),
          kind: row.kind,
          indexKind: row.index_kind,
          indexPercent: row.index_percent === null ? null : Number(row.index_percent),
          ratePercent: row.rate_percent === null ? null : Number(row.rate_percent),
          cdiFactor: accrual?.factor ?? null,
          businessDays: accrual?.businessDays ?? null,
          appliedOn,
          maturesOn,
          now,
        }),
      };
    })
  );

  let totalPrincipal = 0;
  let totalGross = 0;
  let totalNet = 0;
  let hasIncomplete = false;

  for (const holding of holdings) {
    totalPrincipal += holding.principal;
    if (holding.valuation === null) {
      hasIncomplete = true;
      // Sem cálculo, entra pelo principal: é o piso conhecido, e some do
      // total seria pior — o patrimônio apareceria menor do que é.
      totalGross += holding.principal;
      totalNet += holding.principal;
      continue;
    }
    totalGross += holding.valuation.grossValue;
    totalNet += holding.valuation.netValue;
  }

  return { holdings, totalPrincipal, totalGross, totalNet, hasIncomplete };
}
