'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { ceilingOverrideSchema } from '@/lib/schemas';

export interface CeilingOverrideActionState {
  error: string | null;
  success?: boolean;
}

/**
 * Grava o payout e o lucro que a usuária espera de uma empresa específica.
 *
 * O override é sempre dela: `user_id` nulo é reservado pros ajustes globais da
 * Beca, que só entram por fora do app.
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
    return { error: 'Sessão expirada. Entra de novo.' };
  }

  const parsed = ceilingOverrideSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { ticker, payoutPercent, expectedEps } = parsed.data;

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
        error: 'Ainda não sei quantas ações essa empresa tem — só dá pra ajustar o payout.',
      };
    }
    manualProfit = expectedEps * shares;
  }

  const { error } = await supabase.from('ceiling_overrides').upsert(
    {
      user_id: user.id,
      ticker,
      payout: payoutPercent / 100,
      manual_profit: manualProfit,
    },
    { onConflict: 'user_id,ticker' }
  );

  if (error) {
    return { error: 'Não foi possível salvar o ajuste. Tenta de novo.' };
  }

  revalidatePath('/preco-teto');
  return { error: null, success: true };
}

export async function clearCeilingOverride(formData: FormData) {
  const ticker = formData.get('ticker');
  if (typeof ticker !== 'string') return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // O `user_id` explícito protege os ajustes globais da Beca: a RLS deixaria a
  // usuária ler os dela com user_id nulo, mas apagar é outra história.
  await supabase
    .from('ceiling_overrides')
    .delete()
    .eq('ticker', ticker)
    .eq('user_id', user.id);

  revalidatePath('/preco-teto');
}
