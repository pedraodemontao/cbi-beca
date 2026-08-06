import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/layout/bottom-nav';
import { ChatPanel } from '@/components/chat/chat-panel';

interface ChatMessageRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Últimas trocas, mais antiga primeiro. O limite existe porque a conversa
  // inteira volta pro modelo a cada pergunta — e conversa longa vira custo.
  const { data: history } = await supabase
    .from('chat_messages')
    .select('id,role,content')
    .order('created_at', { ascending: false })
    .limit(40);

  const initialMessages = ((history ?? []) as ChatMessageRow[])
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      parts: [{ type: 'text' as const, text: row.content }],
    }));

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

        <ChatPanel initialMessages={initialMessages} />
      </main>
      <BottomNav />
    </>
  );
}
