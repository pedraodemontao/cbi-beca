'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

/**
 * Meta de renda passiva. Um campo só, então a action é direta — sem
 * `useActionState` com estado de erro rico, que aqui só atrapalharia.
 */

const goalSchema = z.object({
  // Teto alto de propósito: quem sonha com R$ 50 mil por mês tem o direito de
  // ver a conta. O que não pode é zero ou negativo.
  goal: z.coerce.number().positive().max(10_000_000),
});

export async function saveIncomeGoal(formData: FormData) {
  const parsed = goalSchema.safeParse({ goal: formData.get('goal') });
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('profiles')
    .update({ income_goal: parsed.data.goal })
    .eq('id', user.id);

  revalidatePath('/resumo');
}

export async function clearIncomeGoal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('profiles').update({ income_goal: null }).eq('id', user.id);
  revalidatePath('/resumo');
}
