-- Renda fixa na carteira: CDB, LCI, LCA e afins.
--
-- TABELA PRÓPRIA, e não mais um valor no enum de `positions`. Renda fixa não
-- tem ticker, não tem quantidade e não tem preço médio — os três campos que
-- `positions` exige como NOT NULL. Forçar (`ticker = 'CDB-BANCO-X'`,
-- `quantity = 1`) faria o banco guardar uma quantidade de coisa nenhuma, e
-- toda tela precisaria do caso especial de qualquer jeito.
--
-- O que renda fixa tem é emissor, taxa, indexador e vencimento. É o que está
-- aqui.
--
-- Escopo desta primeira versão: CDI e prefixado, que cobrem CDB, LCI e LCA.
-- IPCA+ e Tesouro Direto entram no mesmo modelo depois — daí o enum de
-- indexador já nascer como enum, e não como boolean.

create type public.fixed_income_kind as enum (
  'cdb', 'lci', 'lca', 'cri', 'cra', 'debenture', 'poupanca'
);

create type public.fixed_income_index as enum ('cdi', 'prefixado');

create table public.fixed_income_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Texto livre: é o apelido que a aluna reconhece no extrato da corretora.
  -- Não há catálogo de CDB para validar contra, e inventar um seria pior.
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind public.fixed_income_kind not null,

  -- Quanto entrou, em reais. É o principal — o rendimento é calculado, nunca
  -- digitado, pela mesma razão que os proventos são calculados.
  principal numeric(18, 2) not null check (principal > 0),
  applied_on date not null,

  -- Nulo = liquidez diária, sem data para vencer. Papel vencido para de
  -- render: sem isso o patrimônio inflaria sozinho para sempre.
  matures_on date,

  index_kind public.fixed_income_index not null,
  -- "110% do CDI" → 110. Só faz sentido em `cdi`.
  index_percent numeric(6, 2) check (index_percent > 0 and index_percent <= 500),
  -- "12,5% ao ano" → 12.5. Só faz sentido em `prefixado`.
  rate_percent numeric(6, 2) check (rate_percent > 0 and rate_percent <= 100),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- O indexador decide qual taxa é obrigatória. Sem esta trava dá para gravar
  -- um CDI sem percentual, que não tem como ser calculado, e a tela mostraria
  -- "—" sem explicar por quê.
  constraint fixed_income_rate_matches_index check (
    (index_kind = 'cdi' and index_percent is not null and rate_percent is null)
    or
    (index_kind = 'prefixado' and rate_percent is not null and index_percent is null)
  ),

  -- Vencer antes de aplicar não existe.
  constraint fixed_income_maturity_after_application check (
    matures_on is null or matures_on > applied_on
  )
);

create index fixed_income_positions_user_idx
  on public.fixed_income_positions (user_id);

create trigger fixed_income_positions_set_updated_at
  before update on public.fixed_income_positions
  for each row execute function public.set_updated_at();

alter table public.fixed_income_positions enable row level security;

-- Mesma forma das policies de `positions`: cada uma vê e mexe só no que é
-- dela. Aqui não existe escopo global — não há equivalente de "ajuste da
-- Beca" para o CDB de alguém.
create policy "fixed_income_select_own" on public.fixed_income_positions
  for select using (auth.uid() = user_id);

create policy "fixed_income_insert_own" on public.fixed_income_positions
  for insert with check (auth.uid() = user_id);

create policy "fixed_income_update_own" on public.fixed_income_positions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fixed_income_delete_own" on public.fixed_income_positions
  for delete using (auth.uid() = user_id);
