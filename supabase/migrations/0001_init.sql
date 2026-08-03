-- Fase 1: profiles + positions com RLS.
-- Preço de mercado e indicadores NUNCA são armazenados — sempre buscados ao vivo na brapi.

create type public.asset_type as enum ('stock', 'fii');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  asset_type public.asset_type not null,
  quantity numeric(18, 8) not null check (quantity > 0),
  avg_price numeric(18, 4) not null check (avg_price > 0),
  purchase_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index positions_user_id_idx on public.positions (user_id);

-- updated_at automático
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger positions_set_updated_at
  before update on public.positions
  for each row
  execute function public.set_updated_at();

-- profile criado automaticamente no signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- RLS: usuário só acessa o que é dele
alter table public.profiles enable row level security;
alter table public.positions enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "positions_select_own" on public.positions
  for select using (auth.uid() = user_id);

create policy "positions_insert_own" on public.positions
  for insert with check (auth.uid() = user_id);

create policy "positions_update_own" on public.positions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "positions_delete_own" on public.positions
  for delete using (auth.uid() = user_id);
