import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchKnownTickers,
  fetchMarketNews,
  selectDailyFeed,
  selectPortfolioNews,
} from '@/lib/news';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { NewsFeed } from '@/components/noticias/news-feed';

export default async function NoticiasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [known, { data: rows }] = await Promise.all([
    fetchKnownTickers(supabase),
    supabase.from('positions').select('ticker'),
  ]);

  const all = await fetchMarketNews(known);
  const myTickers = [...new Set((rows ?? []).map((row) => row.ticker))];

  const { items, today, todayKey } = selectDailyFeed(all);

  // O filtro por carteira olha uma janela maior que o feed do dia: matéria
  // citando um papel específico é rara, e uma aba que abre vazia todo dia
  // ensina a não clicar nela.
  const mine = selectPortfolioNews(all, new Set(myTickers));

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Notícias do mercado
          </h1>
          <p className="micro-hint">
            O que oito portais de economia publicaram hoje, em até 15 manchetes.
            A lista se refaz a cada 15 minutos e vira todo dia. O código do
            papel aparece quando a matéria cita um ativo do catálogo.
          </p>
        </header>

        <NewsFeed
          items={items}
          mine={mine}
          myTickers={myTickers}
          todayCount={today}
          todayKey={todayKey}
        />

        <InfoNote title="Aviso">
          As matérias são produzidas e publicadas por terceiros; a plataforma
          apenas reúne e ordena as manchetes, sem editar ou endossar o conteúdo.
          Notícia descreve o que já aconteceu e não constitui recomendação de
          compra ou venda.
        </InfoNote>
      </main>
      <BottomNav />
    </>
  );
}
