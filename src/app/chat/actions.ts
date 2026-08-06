'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

/**
 * Apagar a conversa é da usuária, não nosso.
 *
 * O filtro por `user_id` é explícito mesmo com a RLS cuidando disso: um delete
 * sem `where` é o tipo de coisa que a policy protege hoje e ninguém garante
 * amanhã.
 */
export async function clearChatHistory() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('chat_messages').delete().eq('user_id', user.id);
  revalidatePath('/chat');
}
