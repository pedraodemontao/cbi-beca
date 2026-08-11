'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loginSchema, signupSchema } from '@/lib/schemas';

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

export async function signup(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { displayName, email, password } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Este e-mail já possui conta. Faça login.' };
    }
    return { error: 'Não foi possível criar a conta. Tente novamente.' };
  }

  // Sem sessão = projeto exige confirmação de e-mail
  if (!data.session) {
    return {
      error: null,
      success: 'Conta criada. Confirme o e-mail para acessar.',
    };
  }

  redirect('/carteira');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
