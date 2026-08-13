import Link from 'next/link';

export const metadata = {
  title: 'Acesso à Central CBI',
};

/**
 * A rota continua existindo, mas sem formulário.
 *
 * O cadastro por conta própria foi desligado no projeto Supabase em 2026-08-13
 * (`disable_signup`): o acesso é liberado por autorização, e as contas nascem
 * pelo admin API. Um formulário aqui só produziria "Signups not allowed for
 * this instance" em inglês, depois de a pessoa preencher tudo.
 *
 * Manter a URL viva importa porque ela já circulou: quem chegar por um link
 * antigo precisa entender por que não consegue se cadastrar, em vez de bater
 * num 404.
 */
export default function CadastroPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">Acesso por autorização</h2>
        <p className="micro-hint mt-1">
          A Central CBI não tem cadastro aberto. O acesso é liberado para quem
          está autorizado, e os dados do primeiro acesso chegam por fora da
          plataforma.
        </p>
      </div>

      <p className="rounded-panel bg-panel px-4 py-3 text-sm font-medium text-foreground/90">
        Já recebeu e-mail e senha? É só entrar e trocar a senha em
        &quot;Conta&quot;.
      </p>

      <Link href="/login" className="btn-primary text-center">
        Entrar
      </Link>

      <p className="text-center text-sm font-medium text-muted-foreground">
        Perdeu a senha?{' '}
        <Link href="/recuperar" className="font-bold text-primary underline">
          Recuperar acesso
        </Link>
      </p>
    </div>
  );
}
