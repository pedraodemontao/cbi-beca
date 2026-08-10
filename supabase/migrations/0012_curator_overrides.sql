-- Ajuste da Beca valendo pra todo mundo.
--
-- `ceiling_overrides` já nasceu com `user_id` nulo reservado pro ajuste global
-- (migration 0003) e a policy de SELECT já entregava esses ajustes pra todas as
-- usuárias. Só que ninguém conseguia CRIAR um: o `with check (auth.uid() =
-- user_id)` barra qualquer linha com user_id nulo, então a Beca ajustando pela
-- tela salvava um ajuste que só ela mesma via.
--
-- Aqui entra o papel de curadora: quem tem `is_curator` publica o ajuste pra
-- todo mundo; o resto continua ajustando só o próprio.

alter table public.profiles
  add column if not exists is_curator boolean not null default false;

comment on column public.profiles.is_curator is
  'Publica ajuste de preço teto valendo pra todas as usuárias (a Beca).';

-- Security definer porque a policy precisa ler `profiles` de dentro de uma
-- policy — com RLS ligada na própria tabela, a leitura direta entraria em
-- recursão. `search_path` fixo pra função não ser sequestrada por schema.
create or replace function public.is_curator()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select p.is_curator from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.is_curator() from public;
grant execute on function public.is_curator() to authenticated;

-- As três policies de escrita passam a aceitar o ajuste global, e só pra quem
-- é curadora. A de SELECT continua como estava: todo mundo lê o global.
drop policy if exists "ceiling_overrides_insert_own" on public.ceiling_overrides;
drop policy if exists "ceiling_overrides_update_own" on public.ceiling_overrides;
drop policy if exists "ceiling_overrides_delete_own" on public.ceiling_overrides;

create policy "ceiling_overrides_insert" on public.ceiling_overrides
  for insert to authenticated
  with check (
    auth.uid() = user_id
    or (user_id is null and public.is_curator())
  );

create policy "ceiling_overrides_update" on public.ceiling_overrides
  for update to authenticated
  using (
    auth.uid() = user_id
    or (user_id is null and public.is_curator())
  )
  with check (
    auth.uid() = user_id
    or (user_id is null and public.is_curator())
  );

create policy "ceiling_overrides_delete" on public.ceiling_overrides
  for delete to authenticated
  using (
    auth.uid() = user_id
    or (user_id is null and public.is_curator())
  );

-- Depois de aplicar, marcar a conta da Beca:
--
--   update public.profiles set is_curator = true
--   where id = (select id from auth.users where email = 'EMAIL_DA_BECA');
