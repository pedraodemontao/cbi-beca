'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fixedIncomeFormSchema } from '@/lib/schemas';

export interface FixedIncomeActionState {
  error: string | null;
  success?: boolean;
}

/**
 * Renda fixa mora em arquivo próprio de actions porque mora em tabela própria
 * — e porque `carteira/actions.ts` já é o CRUD de `positions`. Misturar as
 * duas num arquivo só faria cada função precisar dizer de qual tabela fala.
 */

/** O que o formulário manda vira linha do banco. Um lugar só, três actions. */
function toRow(data: ReturnType<typeof fixedIncomeFormSchema.parse>) {
  return {
    name: data.name,
    kind: data.kind,
    principal: data.principal,
    applied_on: data.appliedOn,
    matures_on: data.maturesOn ?? null,
    index_kind: data.indexKind,
    // A constraint do banco exige que só uma das taxas venha preenchida, e o
    // indexador decide qual. Zerar a outra aqui evita que trocar de CDI pra
    // prefixado numa edição deixe o percentual antigo pendurado.
    index_percent: data.indexKind === 'cdi' ? (data.indexPercent ?? null) : null,
    rate_percent: data.indexKind === 'prefixado' ? (data.ratePercent ?? null) : null,
  };
}

function revalidate() {
  revalidatePath('/carteira');
  revalidatePath('/resumo');
}

export async function addFixedIncome(
  _prev: FixedIncomeActionState,
  formData: FormData
): Promise<FixedIncomeActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const parsed = fixedIncomeFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from('fixed_income_positions')
    .insert({ user_id: user.id, ...toRow(parsed.data) });

  if (error) return { error: 'Não foi possível salvar. Tente novamente.' };

  revalidate();
  return { error: null, success: true };
}

export async function updateFixedIncome(
  _prev: FixedIncomeActionState,
  formData: FormData
): Promise<FixedIncomeActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Sessão expirada. Faça login novamente.' };

  const id = formData.get('id');
  if (typeof id !== 'string') return { error: 'Aplicação não encontrada.' };

  const parsed = fixedIncomeFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // O `eq('user_id')` é redundante com a RLS e fica de propósito: é a segunda
  // tranca, e o custo é zero.
  const { error } = await supabase
    .from('fixed_income_positions')
    .update(toRow(parsed.data))
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return { error: 'Não foi possível salvar. Tente novamente.' };

  revalidate();
  return { error: null, success: true };
}

export async function deleteFixedIncome(formData: FormData) {
  const id = formData.get('id');
  if (typeof id !== 'string') return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('fixed_income_positions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  revalidate();
}
