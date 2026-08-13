'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  loginSchema,
  newPasswordSchema,
  passwordResetRequestSchema,
} from '@/lib/schemas';

export interface AuthFormState {
  error: string | null;
  success?: string;
}

export async function login(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: 'E-mail ou senha incorretos' };
  }

  redirect('/carteira');
}

/*
 * NÃO existe action de cadastro, e isso é decisão de produto, não esquecimento.
 *
 * O acesso à plataforma é liberado por autorização: as contas nascem pelo admin
 * API (`scripts/criar-alunos.mjs` hoje, webhook da Kiwify depois), já
 * confirmadas e com senha provisória. O `disable_signup` do projeto Supabase
 * está ligado desde 2026-08-13, então `supabase.auth.signUp()` responde
 * "Signups not allowed for this instance" — uma action aqui seria um caminho
 * que o servidor recusa por definição.
 */

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

/**
 * Pede o link de redefinição de senha.
 *
 * **Responde a mesma coisa para e-mail existente e inexistente, de propósito.**
 * Uma resposta diferente para cada caso transforma este formulário em consulta
 * de quem tem conta na plataforma — é enumeração de usuária, e não custa nada
 * evitar.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = passwordResetRequestSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await siteOrigin()}/auth/confirm?next=/nova-senha`,
  });

  return {
    error: null,
    success:
      'Se existir uma conta com esse e-mail, o link de redefinição foi enviado. Confira também a caixa de spam.',
  };
}

/** Grava a nova senha. Exige sessão — quem chega pelo link do e-mail já tem. */
export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // O link de redefinição expira em 1 hora. Sem esta checagem o `updateUser`
  // falharia com mensagem em inglês, e a usuária não saberia que só precisa
  // pedir outro link.
  if (!user) {
    return {
      error: 'O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".',
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: 'Não foi possível salvar a senha. Tente novamente.' };
  }

  return { error: null, success: 'Senha alterada.' };
}

/**
 * Origem pública do app, para montar o link que vai no e-mail.
 *
 * Sai do cabeçalho da requisição em vez de constante: o app responde em
 * `centralcbi.site`, em `beca-carteira.vercel.app` e em `localhost` durante o
 * desenvolvimento, e o link tem que voltar para o domínio de onde a pessoa
 * saiu. O Supabase só aceita destinos que estejam na lista de redirects do
 * projeto, então um domínio inventado no cabeçalho não vira link válido.
 */
async function siteOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get('host') ?? 'centralcbi.site';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}
