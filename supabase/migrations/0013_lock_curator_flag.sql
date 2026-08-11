-- Fecha a escalação de privilégio aberta pela 0012.
--
-- `profiles_update_own` (migration 0001) libera UPDATE da LINHA inteira, e o
-- grant do Supabase dá `authenticated` em todas as colunas. Quando a 0012
-- acrescentou `is_curator` a essa tabela, virou um caminho de escalação: um
-- PATCH direto no PostgREST — sem passar por Server Action nenhuma —
--
--   PATCH /rest/v1/profiles?id=eq.<meu_id>  {"is_curator": true}
--
-- passava no `using` e no `with check`, e a partir daí `public.is_curator()`
-- devolvia true. A conta promovida escreveria ajuste global de preço teto, que
-- todas as usuárias veem e que o chat repassa como número pronto.
--
-- A checagem em `saveCeilingOverride` nunca protegeu isso: ela vale pro
-- formulário, não pra API. Quem protege é a coluna.

-- Privilégio por coluna: a usuária escreve o que é dela; `is_curator` só muda
-- por fora do app (SQL Editor ou service role).
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (display_name, income_goal) on public.profiles to authenticated;

-- Defesa em profundidade: se um grant futuro voltar a liberar a tabela inteira,
-- o trigger ainda barra. `auth.uid() is not null` deixa o service role passar,
-- que é como a curadoria é concedida.
create or replace function public.protect_curator_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and new.is_curator is distinct from old.is_curator then
    raise exception 'is_curator não pode ser alterado pela própria conta';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_curator on public.profiles;
create trigger profiles_protect_curator
  before update on public.profiles
  for each row execute function public.protect_curator_flag();

-- `revoke ... from public` não tira o grant explícito que o Supabase dá a
-- `anon`/`authenticated` por default privileges — o revoke da 0012 não teve
-- efeito nenhum. Estas são as funções que não devem ser chamáveis por RPC.
revoke execute on function public.is_curator() from anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_curator_flag() from public, anon, authenticated;

-- `set_updated_at` estava com search_path mutável (advisor do Supabase).
alter function public.set_updated_at() set search_path = pg_catalog, public;

-- O payout já tinha CHECK; o lucro manual não tinha nenhum. A validação vivia
-- só na Server Action, e o PostgREST está a um fetch de distância.
alter table public.ceiling_overrides
  drop constraint if exists ceiling_overrides_manual_profit_positive;
alter table public.ceiling_overrides
  add constraint ceiling_overrides_manual_profit_positive
  check (manual_profit is null or manual_profit > 0);

-- FK sem índice de cobertura (advisor de performance).
create index if not exists ceiling_overrides_ticker_idx
  on public.ceiling_overrides (ticker);
