'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isCurator } from '@/lib/curator';
import { ceilingOverrideSchema } from '@/lib/schemas';

export interface CeilingOverrideActionState {
  error: string | null;
  success?: boolean;
}

const NOT_CURATOR = 'Apenas a curadoria pode publicar ajustes para todas as contas.';

/**
 * Grava o payout e o lucro que se espera de uma empresa específica.
 *
 * Dois escopos: o ajuste da usuária, que só ela vê, e o da Beca (`user_id`
 * nulo), que vale pra todas — é o que faz a tabela chegar pra galera já com a
 * leitura dela, sem cada uma ter que refazer a conta.
 */
export async function saveCeilingOverride(
  _prev: CeilingOverrideActionState,
  formData: FormData
): Promise<CeilingOverrideActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Sessão expirada. Faça login novamente.' };
  }

  const parsed = ceilingOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { ticker, payoutPercent, expectedEps, scope } = parsed.data;

  // A RLS já barraria, mas o erro chegaria cru. E a checagem aqui é o que
  // garante que mexer no HTML não publica ajuste em nome da Beca.
  if (scope === 'global' && !(await isCurator(supabase, user.id))) {
    return { error: NOT_CURATOR };
  }

  // O lucro total sai do LPA digitado vezes as ações do banco — a quantidade
  // nunca vem do formulário, senão dava pra forjar o teto de qualquer empresa.
  let manualProfit: number | null = null;
  if (expectedEps !== undefined) {
    const { data: fundamentals } = await supabase
      .from('company_fundamentals')
      .select('shares_outstanding')
      .eq('ticker', ticker)
      .maybeSingle();

    const shares = (fundamentals as { shares_outstanding: number | null } | null)
      ?.shares_outstanding;

    if (!shares) {
      return {
        error: 'Quantidade de ações desta empresa indisponível. Apenas o payout pode ser ajustado.',
      };
    }
    manualProfit = expectedEps * shares;
  }

  // `unique nulls not distinct (user_id, ticker)` é o que faz o ON CONFLICT
  // enxergar o conflito quando o user_id é nulo — sem isso cada publicação da
  // Beca viraria uma linha nova.
  const { error } = await supabase.from('ceiling_overrides').upsert(
    {
      user_id: scope === 'global' ? null : user.id,
      ticker,
      payout: payoutPercent / 100,
      manual_profit: manualProfit,
    },
    { onConflict: 'user_id,ticker' }
  );

  if (error) {
    return { error: 'Não foi possível salvar o ajuste. Tente novamente.' };
  }

  // Publicou pra todo mundo: o ajuste antigo dela mesma sai do caminho. Como o
  // pessoal vence o global na hora de aplicar, deixar os dois faria a Beca
  // continuar vendo o número velho e achar que a publicação não pegou.
  if (scope === 'global') {
    await supabase
      .from('ceiling_overrides')
      .delete()
      .eq('ticker', ticker)
      .eq('user_id', user.id);
  }

  revalidatePath('/preco-teto');
  return { error: null, success: true };
}

export async function clearCeilingOverride(formData: FormData) {
  const ticker = formData.get('ticker');
  if (typeof ticker !== 'string') return;
  const scope = formData.get('scope') === 'global' ? 'global' : 'personal';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (scope === 'global') {
    if (!(await isCurator(supabase, user.id))) return;
    // `is('user_id', null)` em vez de `eq`: no PostgREST comparar com nulo por
    // igualdade não casa linha nenhuma.
    await supabase
      .from('ceiling_overrides')
      .delete()
      .eq('ticker', ticker)
      .is('user_id', null);
  } else {
    // O `user_id` explícito protege os ajustes globais da Beca: a RLS deixa a
    // usuária ler os que têm user_id nulo, e sem o filtro o delete tentaria
    // levá-los junto.
    await supabase
      .from('ceiling_overrides')
      .delete()
      .eq('ticker', ticker)
      .eq('user_id', user.id);
  }

  revalidatePath('/preco-teto');
}
