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
          Não foi possível confirmar o e-mail — o link pode ter expirado ou já
          ter sido usado. Tente entrar abaixo; se não funcionar, peça um novo
          link em &quot;Esqueci minha senha&quot;.
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
        <Link href="/recuperar" className="font-bold text-primary underline">
          Esqueci minha senha
        </Link>
      </p>

      {/* Não existe "Criar conta": o acesso é liberado por autorização. O link
          leva à explicação de como conseguir, não a um formulário que o
          servidor recusaria. */}
      <p className="text-center text-sm font-medium text-muted-foreground">
        Ainda não tem acesso?{' '}
        <Link href="/cadastro" className="font-bold text-primary underline">
          Como conseguir
        </Link>
      </p>
    </div>
  );
}
