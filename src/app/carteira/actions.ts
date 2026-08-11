'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { positionFormSchema } from '@/lib/schemas';

export interface PositionActionState {
  error: string | null;
  success?: boolean;
}

export async function addPosition(
  _prev: PositionActionState,
  formData: FormData
): Promise<PositionActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Sessão expirada. Faça login novamente.' };
  }

  const parsed = positionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { ticker, assetType, quantity, avgPrice, purchaseDate } = parsed.data;
  const { error } = await supabase.from('positions').insert({
    user_id: user.id,
    ticker,
    asset_type: assetType,
    quantity,
    avg_price: avgPrice,
    purchase_date: purchaseDate ?? null,
  });

  if (error) {
    return { error: 'Não foi possível salvar. Tente novamente.' };
  }

  revalidatePath('/carteira');
  revalidatePath('/resumo');
  return { error: null, success: true };
}

export async function updatePosition(
  _prev: PositionActionState,
  formData: FormData
): Promise<PositionActionState> {
  const id = formData.get('id');
  if (typeof id !== 'string') {
    return { error: 'Posição inválida.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: 'Sessão expirada. Faça login novamente.' };
  }

  const parsed = positionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { ticker, assetType, quantity, avgPrice, purchaseDate } = parsed.data;
  // RLS garante que só o dono consegue atualizar
  const { error } = await supabase
    .from('positions')
    .update({
      ticker,
      asset_type: assetType,
      quantity,
      avg_price: avgPrice,
      purchase_date: purchaseDate ?? null,
    })
    .eq('id', id);

  if (error) {
    return { error: 'Não foi possível salvar a alteração. Tente novamente.' };
  }

  revalidatePath('/carteira');
  revalidatePath('/resumo');
  return { error: null, success: true };
}

export async function deletePosition(formData: FormData) {
  const id = formData.get('id');
  if (typeof id !== 'string') return;

  const supabase = await createClient();
  // RLS garante que só o dono consegue deletar
  await supabase.from('positions').delete().eq('id', id);

  revalidatePath('/carteira');
  revalidatePath('/resumo');
}
