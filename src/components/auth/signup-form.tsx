'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signup, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = { error: null };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, initialState);

  if (state.success) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p className="rounded-panel bg-primary-wash px-4 py-5 text-sm font-semibold text-primary-deep">
          {state.success}
        </p>
        <p className="text-sm font-medium text-muted-foreground">
          Depois de confirmar,{' '}
          <Link href="/login" className="font-bold text-primary underline">
            entra por aqui
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">
            Como a gente te chama?
          </span>
          <input
            name="displayName"
            type="text"
            autoComplete="name"
            required
            className="field"
          />
        </label>

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
            autoComplete="new-password"
            minLength={6}
            required
            className="field"
          />
          <span className="text-xs font-medium text-muted-foreground">
            Pelo menos 6 caracteres.
          </span>
        </label>

        {state.error && (
          <p className="text-sm font-semibold text-negative">{state.error}</p>
        )}

        <button type="submit" disabled={isPending} className="btn-primary mt-1">
          {isPending ? 'Criando conta…' : 'Criar minha conta'}
        </button>
      </form>

      <p className="text-center text-sm font-medium text-muted-foreground">
        Já tem conta?{' '}
        <Link href="/login" className="font-bold text-primary underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
