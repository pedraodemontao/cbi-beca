import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { NewPasswordForm } from '@/components/auth/new-password-form';

export const metadata = {
  title: 'Minha conta',
};

/**
 * Troca de senha com a pessoa já logada.
 *
 * Existe separada da redefinição por e-mail porque é o caminho que NÃO depende
 * de e-mail nenhum: quem entrou com a senha provisória que recebeu troca por
 * uma sua aqui, sem esperar link chegar.
 */
export default async function ContaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Minha conta
          </h1>
          <p className="micro-hint">Dados de acesso da sua conta.</p>
        </header>

        <section className="card-lg">
          <h2 className="text-lg font-extrabold tracking-tight">Cadastro</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="font-medium text-muted-foreground">Nome</dt>
              <dd className="font-bold">{profile?.display_name ?? '—'}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="font-medium text-muted-foreground">E-mail</dt>
              <dd className="font-bold break-all">{user.email}</dd>
            </div>
          </dl>
        </section>

        <section className="card-lg">
          <NewPasswordForm variant="account" />
        </section>

        <InfoNote title="Senha provisória">
          Se você recebeu uma senha pronta para o primeiro acesso, troque por uma
          sua aqui. A senha provisória foi enviada por fora da plataforma e não
          deve continuar valendo.
        </InfoNote>
      </main>
      <BottomNav />
    </>
  );
}
