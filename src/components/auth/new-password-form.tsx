'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updatePassword, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = { error: null };

interface NewPasswordFormProps {
  /** Título e texto mudam entre "redefinir pelo link" e "trocar já logada". */
  variant: 'reset' | 'account';
}

export function NewPasswordForm({ variant }: NewPasswordFormProps) {
  const [state, formAction, isPending] = useActionState(updatePassword, initialState);

  const isReset = variant === 'reset';

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          {isReset ? 'Escolha uma nova senha' : 'Alterar senha'}
        </h2>
        <p className="micro-hint mt-1">
          Pelo menos 8 caracteres. Depois de salvar, use a senha nova para entrar.
        </p>
      </div>

      {state.success ? (
        <>
          <p className="rounded-panel bg-primary-wash px-4 py-3 text-sm font-semibold text-primary-deep">
            {state.success}
          </p>
          <Link href="/carteira" className="btn-primary text-center">
            Ir para a carteira
          </Link>
        </>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-foreground">Nova senha</span>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="field"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-foreground">Repita a senha</span>
            <input
              name="passwordConfirmation"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className="field"
            />
          </label>

          {state.error && (
            <p className="text-sm font-semibold text-negative">{state.error}</p>
          )}

          <button type="submit" disabled={isPending} className="btn-primary mt-1">
            {isPending ? 'Salvando…' : 'Salvar senha'}
          </button>
        </form>
      )}
    </div>
  );
}
