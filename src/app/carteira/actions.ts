'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { positionFormSchema } from '@/lib/schemas';
import { CRYPTO_NAMES, isKnownCrypto } from '@/lib/coingecko';

/** Amostra para a mensagem de erro — nomear algumas ajuda mais que listar 30. */
const SUPPORTED_CRYPTO_SAMPLE = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA']
  .map((symbol) => `${symbol} (${CRYPTO_NAMES[symbol]})`)
  .join(', ');

export interface PositionActionState {
  error: string | null;
  success?: boolean;
}


/**
 * Cripto fora da lista curada não pode ser salva.
 *
 * Sem esta trava a posição entra no banco, nunca ganha preço e fica
 * "Preço indisponível agora" para sempre — sem dizer por quê. É pior que
 * recusar: a pessoa acha que cadastrou e o patrimônio dela mente para baixo.
 *
 * A lista é curada de propósito (ver `lib/coingecko.ts`: as siglas colidem
 * entre ~17 mil moedas), então crescer é acrescentar duas linhas lá.
 */
function rejectUnknownCrypto(
  assetType: string,
  ticker: string
): string | null {
  if (assetType !== 'crypto' || isKnownCrypto(ticker)) return null;
  return `${ticker} não está na lista de criptomoedas com cotação. Hoje temos ${SUPPORTED_CRYPTO_SAMPLE} e outras — se faltar a sua, me avise.`;
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

  const cryptoError = rejectUnknownCrypto(assetType, ticker);
  if (cryptoError) return { error: cryptoError };

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

  const cryptoError = rejectUnknownCrypto(assetType, ticker);
  if (cryptoError) return { error: cryptoError };

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
