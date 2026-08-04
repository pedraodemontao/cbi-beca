-- Preço Teto — etapa 1: catálogo de ativos, fundamentos e overrides.
--
-- `companies` e `company_fundamentals` guardam dado público de mercado, não dado
-- de usuária: qualquer pessoa logada lê, e só os crons escrevem (service role
-- ignora RLS, então basta não existir policy de escrita).
--
-- Isso é exceção consciente à regra "preço de mercado nunca vai pro banco": a
-- tabela de preço teto ranqueia a bolsa inteira e não dá pra buscar 400 ativos
-- ao vivo a cada pageview. O dado é cache com carimbo de validade, não verdade.

create table public.companies (
  ticker text primary key,
  name text not null,
  asset_type text not null check (asset_type in ('stock', 'fii', 'bdr')),
  sector text,
  subsector text,
  logo_url text,
  price numeric(18, 4),
  change_percent numeric(10, 4),
  market_cap numeric(22, 2),
  price_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

create index companies_type_sector_idx on public.companies (asset_type, sector);
create index companies_market_cap_idx on public.companies (market_cap desc nulls last);

create table public.company_fundamentals (
  ticker text primary key references public.companies (ticker) on delete cascade,
  cvm_code text,
  corporate_name text,
  -- Data do balanço que originou os números. A UI PRECISA exibir: em agosto o
  -- dado mais recente ainda é do 1º trimestre.
  reference_date date,
  shares_outstanding bigint,
  -- Convertidos pra reais na ingestão (a CVM publica em milhares).
  net_income numeric(22, 2),
  equity numeric(22, 2),
  lpa numeric(18, 6),
  vpa numeric(18, 6),
  roe numeric(12, 4),
  price_earnings numeric(14, 4),
  price_to_book numeric(14, 4),
  net_margin numeric(12, 4),
  net_debt_ebitda numeric(14, 4),
  -- Preenchidos na etapa do Bazin: dependem do /dividends, que é plano Pro.
  dividends_12m numeric(18, 6),
  dividends_5y_avg numeric(18, 6),
  updated_at timestamptz not null default now()
);

-- Payout e lucro que a usuária digita por cima do sugerido.
-- user_id nulo = override global da Beca, visível pra todo mundo.
create table public.ceiling_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  ticker text not null references public.companies (ticker) on delete cascade,
  payout numeric(6, 4) check (payout > 0 and payout <= 2),
  manual_profit numeric(22, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (user_id, ticker)
);

create index ceiling_overrides_user_idx on public.ceiling_overrides (user_id);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

create trigger company_fundamentals_set_updated_at
  before update on public.company_fundamentals
  for each row execute function public.set_updated_at();

create trigger ceiling_overrides_set_updated_at
  before update on public.ceiling_overrides
  for each row execute function public.set_updated_at();

alter table public.companies enable row level security;
alter table public.company_fundamentals enable row level security;
alter table public.ceiling_overrides enable row level security;

create policy "companies_select_authenticated" on public.companies
  for select to authenticated using (true);

create policy "company_fundamentals_select_authenticated" on public.company_fundamentals
  for select to authenticated using (true);

-- Cada uma lê o próprio override e os globais da Beca; escreve só o próprio.
create policy "ceiling_overrides_select" on public.ceiling_overrides
  for select to authenticated using (user_id is null or auth.uid() = user_id);

create policy "ceiling_overrides_insert_own" on public.ceiling_overrides
  for insert to authenticated with check (auth.uid() = user_id);

create policy "ceiling_overrides_update_own" on public.ceiling_overrides
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "ceiling_overrides_delete_own" on public.ceiling_overrides
  for delete to authenticated using (auth.uid() = user_id);
