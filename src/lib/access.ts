import 'server-only';
import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Liberar e revogar acesso, do jeito que `scripts/acesso.mjs` e
 * `scripts/criar-alunos.mjs` já faziam à mão — agora chamável de dentro do
 * app, pelo webhook da Kiwify.
 *
 * As regras são as mesmas dos scripts, e vale repetir por quê:
 *
 *   - **Liberar é CONVIDAR, não criar com senha.** Desde o SMTP próprio
 *     (2026-08-18) o convite chega por e-mail e cai em `/nova-senha` com
 *     sessão; a aluna escolhe a senha e entra. Sem CSV, sem senha provisória.
 *   - **Revogar é `ban_duration`, não apagar.** Derruba a sessão aberta na
 *     hora e não toca em carteira, proventos nem ajustes — reembolso pode ser
 *     revertido, exclusão não.
 *   - **Quem já existe não é sobrescrito.** Comprar de novo depois de um
 *     reembolso restaura; comprar tendo acesso ativo não faz nada; ter sido
 *     convidada e nunca ter aceitado reenvia o convite.
 */

/** Cem anos: o Supabase só tem banimento por duração. */
const FOREVER = '876000h';
const PAGE_SIZE = 1000;

export type GrantResult =
  | { action: 'invited' | 'reinvited' | 'restored' | 'noop'; userId: string | null; detail: string };

export type RevokeResult =
  | { action: 'revoked' | 'noop'; userId: string | null; detail: string };

export function isRevoked(user: Pick<User, 'banned_until'>): boolean {
  const until = user.banned_until;
  return Boolean(until) && new Date(until as string).getTime() > Date.now();
}

/**
 * O admin API não filtra por e-mail: é paginar e procurar. Página de 1.000
 * cobre a turma com folga; se um dia passar disso, o certo é uma função SQL
 * `security definer` lendo `auth.users`, não uma página maior.
 */
export async function findUserByEmail(email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  const admin = createAdminClient();

  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) throw new Error(`listUsers falhou: ${error.message}`);

    const found = data.users.find((user) => (user.email ?? '').toLowerCase() === target);
    if (found) return found;
    if (data.users.length < PAGE_SIZE) return null;
  }
}

export async function grantAccess(email: string, name: string | null): Promise<GrantResult> {
  const admin = createAdminClient();
  const existing = await findUserByEmail(email);

  if (!existing) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { display_name: name } : undefined,
    });
    if (error) {
      // Corrida com outra entrega do mesmo evento: a outra convidou primeiro.
      if (/already/i.test(error.message)) {
        return { action: 'noop', userId: null, detail: 'conta criada por outra entrega' };
      }
      throw new Error(`invite falhou: ${error.message}`);
    }
    return { action: 'invited', userId: data.user?.id ?? null, detail: 'convite enviado' };
  }

  let restored = false;
  if (isRevoked(existing)) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, { ban_duration: 'none' });
    if (error) throw new Error(`restaurar falhou: ${error.message}`);
    restored = true;
  }

  // Convidada que nunca abriu o link: `email_confirmed_at` só é preenchido
  // quando ela aceita. Reenviar é o que ela precisa — o e-mail se perdeu, ou
  // o link de 1 hora venceu. Vale também para quem foi reembolsada antes de
  // aceitar e comprou de novo: só tirar o banimento a deixaria com um convite
  // vencido e nenhum caminho para dentro.
  if (!existing.email_confirmed_at) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: name ? { display_name: name } : undefined,
    });
    if (error) throw new Error(`reenvio do convite falhou: ${error.message}`);
    return restored
      ? { action: 'restored', userId: existing.id, detail: 'acesso restaurado e convite reenviado' }
      : { action: 'reinvited', userId: existing.id, detail: 'convite reenviado' };
  }

  if (restored) return { action: 'restored', userId: existing.id, detail: 'acesso restaurado' };
  return { action: 'noop', userId: existing.id, detail: 'já tinha acesso' };
}

export async function revokeAccess(email: string): Promise<RevokeResult> {
  const admin = createAdminClient();
  const existing = await findUserByEmail(email);

  if (!existing) return { action: 'noop', userId: null, detail: 'não há conta com esse e-mail' };
  if (isRevoked(existing)) return { action: 'noop', userId: existing.id, detail: 'já estava revogada' };

  const { error } = await admin.auth.admin.updateUserById(existing.id, { ban_duration: FOREVER });
  if (error) throw new Error(`revogar falhou: ${error.message}`);
  return { action: 'revoked', userId: existing.id, detail: 'sessão derrubada, dados intactos' };
}
