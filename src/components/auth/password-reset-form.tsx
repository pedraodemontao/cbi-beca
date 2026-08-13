'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { requestPasswordReset, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = { error: null };

export function PasswordResetForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialState
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Esqueci minha senha</h2>
        <p className="micro-hint mt-1">
          Informe o e-mail da conta e enviamos um link para escolher uma nova senha.
        </p>
      </div>

      {state.success ? (
        <p className="rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
          {state.success}
        </p>
      ) : (
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

          {state.error && (
            <p className="text-sm font-semibold text-negative">{state.error}</p>
          )}

          <button type="submit" disabled={isPending} className="btn-primary mt-1">
            {isPending ? 'Enviando…' : 'Enviar link'}
          </button>
        </form>
      )}

      <p className="text-center text-sm font-medium text-muted-foreground">
        <Link href="/login" className="font-bold text-primary underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}
