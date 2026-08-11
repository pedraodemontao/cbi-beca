'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { login, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = { error: null };

interface LoginFormProps {
  confirmError?: boolean;
}

export function LoginForm({ confirmError }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, initialState);

  return (
    <div className="flex flex-col gap-5">
      {confirmError && (
        <p className="rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
          Não foi possível confirmar o e-mail. Tente fazer login; se o acesso
          cria a conta de novo.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">Senha</span>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="field"
          />
        </label>

        {state.error && (
          <p className="text-sm font-semibold text-negative">{state.error}</p>
        )}

        <button type="submit" disabled={isPending} className="btn-primary mt-1">
          {isPending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="text-center text-sm font-medium text-muted-foreground">
        Não tem conta?{' '}
        <Link href="/cadastro" className="font-bold text-primary underline">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
