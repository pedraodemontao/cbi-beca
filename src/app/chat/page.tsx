import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/layout/bottom-nav';
import { ChatPanel } from '@/components/chat/chat-panel';

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.7rem,5.5vw,2.1rem)] font-extrabold tracking-tight">
            Chat com a Beca
          </h1>
          <p className="micro-hint">
            ⚠️ Conteúdo educacional — a Beca explica, mas nunca recomenda comprar
            ou vender.
          </p>
        </header>

        <ChatPanel />
      </main>
      <BottomNav />
    </>
  );
}
