-- Snapshot diário do patrimônio, pra desenhar a evolução no tempo.
-- Gravado pelo cron (/api/cron/snapshot) com service role; usuário só lê o seu.

create table public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  captured_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  total_value numeric(18, 2) not null,
  invested_value numeric(18, 2) not null,
  created_at timestamptz not null default now(),
  unique (user_id, captured_on)
);

create index portfolio_snapshots_user_date_idx
  on public.portfolio_snapshots (user_id, captured_on desc);

alter table public.portfolio_snapshots enable row level security;

-- Só leitura pro dono. A escrita é exclusiva do cron (service role, que ignora RLS).
create policy "snapshots_select_own" on public.portfolio_snapshots
  for select using (auth.uid() = user_id);
