-- Histórico do chat.
--
-- Até aqui a conversa vivia só na memória do componente: recarregar a página
-- apagava tudo. Pra quem está aprendendo isso é pior que parecer — a pessoa
-- pergunta "o que é dividend yield", fecha o app, volta e a explicação sumiu.

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'user' ou 'assistant'. O prompt de sistema NUNCA é gravado: ele carrega o
  -- contexto financeiro da usuária e é remontado a cada requisição.
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index chat_messages_user_idx on public.chat_messages (user_id, created_at);

alter table public.chat_messages enable row level security;

-- Conversa é dado pessoal: cada uma só enxerga a própria.
create policy "chat_messages_select_own" on public.chat_messages
  for select to authenticated using (auth.uid() = user_id);

create policy "chat_messages_insert_own" on public.chat_messages
  for insert to authenticated with check (auth.uid() = user_id);

create policy "chat_messages_delete_own" on public.chat_messages
  for delete to authenticated using (auth.uid() = user_id);
