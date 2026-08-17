'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { login, type AuthFormState } from '@/app/(auth)/actions';

const initialState: AuthFormState = { error: null };

interface LoginFormProps {
  confirmError?: boolean;
}

export function LoginForm({ confirmError }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, initialState);
  // A senha do primeiro acesso é provisória, tem 12 caracteres e sai de um
  // CSV — é lida numa tela e digitada em outra. Sem poder conferir o que
  // digitou, a aluna erra e recebe "e-mail ou senha inválidos" sem saber se o
  // problema foi a senha ou o acesso.
  const [showPassword, setShowPassword] = useState(false);

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
            placeholder="voce@exemplo.com"
            // Primeiro campo da primeira tela: não há nada antes dele pra
            // atrapalhar, e no celular economiza um toque.
            autoFocus
            required
            className="field"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">Senha</span>
          <span className="relative flex items-center">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Sua senha"
              required
              // Espaço à direita pro botão de exibir, senão o texto passa por
              // baixo dele nas senhas longas. Medido com o rótulo maior
              // ("Ocultar"): a caixa do botão ocupa 68px, então 64px de recuo
              // encostava.
              className="field pr-20"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-pressed={showPassword}
              // `py-2.5` põe o alvo em 36px de altura, que é o piso que o
              // resto do app usa desde o QA de celular.
              className="absolute right-2 rounded-full px-3 py-2.5 text-xs font-bold text-muted-foreground transition-colors hover:text-primary"
            >
              {showPassword ? 'Ocultar' : 'Exibir'}
            </button>
          </span>
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
