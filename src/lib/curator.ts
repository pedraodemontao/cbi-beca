import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Quem pode publicar ajuste de preço teto valendo pra todo mundo.
 *
 * A RLS já barra sozinha (migration 0012), mas a tela precisa saber antes de
 * oferecer a opção, e a action precisa saber pra devolver mensagem em português
 * em vez de um erro cru do Postgres.
 *
 * Recebe o `userId` de quem já chamou `auth.getUser()` — quem chama sempre
 * acabou de fazer isso, e repetir a validação do token custa uma ida ao
 * Supabase por render.
 */
export async function isCurator(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('is_curator')
    .eq('id', userId)
    .maybeSingle();

  return (data as { is_curator: boolean } | null)?.is_curator ?? false;
}
