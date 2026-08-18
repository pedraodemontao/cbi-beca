-- Trilha de auditoria do acesso.
--
-- Até aqui a única marca de "quem tem acesso" era o `banned_until` do
-- Supabase, que diz QUE a conta está bloqueada — não por quê, nem quem
-- bloqueou, nem quando a compra que a criou aconteceu. Enquanto revogar era
-- o Pedro rodando um script, isso bastava: ele sabia. Com o webhook da Kiwify
-- decidindo sozinho, cada decisão precisa ficar registrada com o evento que a
-- provocou — reembolso, chargeback e cancelamento de assinatura chegam pelo
-- mesmo canal e têm respostas diferentes.
--
-- A tabela também é o que torna o webhook idempotente: a Kiwify reenvia o
-- mesmo evento quando não recebe 2xx, e (source, external_id, event_type) diz
-- se aquele já foi tratado.

create table public.access_events (
  id uuid primary key default gen_random_uuid(),
  -- De onde veio a decisão: 'kiwify' hoje; 'script' se um dia os scripts
  -- passarem a registrar aqui também.
  source text not null,
  -- Identificador do evento na origem (order_id da Kiwify). Nulo quando a
  -- origem não manda um — aí não há como deduplicar, e não se deduplica.
  external_id text,
  event_type text not null,
  order_status text,
  email text,
  product_id text,
  -- O que foi feito: invited, reinvited, restored, revoked, noop, ignored,
  -- dry_run, error. Texto livre de propósito — enum aqui obrigaria migration a
  -- cada verbo novo, e a coluna é lida por gente, não por código.
  action text not null,
  detail text,
  -- Payload bruto, sempre. O formato do webhook da Kiwify não é documentado
  -- publicamente; a primeira entrega real é o que mostra os campos de verdade,
  -- e ela precisa estar guardada inteira para conferir depois.
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index access_events_dedupe_idx
  on public.access_events (source, external_id, event_type)
  where external_id is not null;

create index access_events_email_idx on public.access_events (email, received_at desc);

-- Só o service role escreve e lê: RLS ligada, nenhuma policy. A usuária não
-- tem o que fazer com o histórico de compra dela aqui, e o payload carrega CPF
-- e telefone que a Kiwify manda.
alter table public.access_events enable row level security;
