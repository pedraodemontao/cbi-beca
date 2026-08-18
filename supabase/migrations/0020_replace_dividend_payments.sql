-- Substituição atômica dos pagamentos de um ticker.
--
-- `syncDividends` precisa SUBSTITUIR o histórico de cada ticker (o valor faz
-- parte da chave primária: um pagamento revisado na fonte viraria linha nova
-- num upsert, e a renda apareceria contada duas vezes). Até aqui isso era um
-- `delete ... in (tickers)` seguido de `insert` em blocos de 500, em duas
-- requisições PostgREST sem transação entre elas. Um único valor que o banco
-- recuse — 3,4e15 estourando `numeric(18,8)`, zero batendo no `check > 0`,
-- duplicata na chave — derrubava o bloco INTEIRO do insert, e todos os
-- tickers daquele bloco e dos seguintes ficavam sem nenhum pagamento até a
-- próxima sincronização. O `sane()` fechou o gatilho conhecido; isto fecha o
-- desenho.
--
-- Uma função PL/pgSQL faz o delete e o insert de cada ticker dentro de um
-- bloco `begin … exception`, que o Postgres executa como subtransação: se o
-- insert daquele ticker falhar, só ele volta ao estado anterior — histórico
-- antigo intacto — e o motivo é devolvido para o log. Os outros tickers do
-- lote seguem. Uma chamada por lote, não por ticker.

create or replace function public.replace_dividend_payments(batch jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  item jsonb;
  ticker_value text;
  inserted_now integer;
  replaced integer := 0;
  inserted integer := 0;
  failed jsonb := '[]'::jsonb;
begin
  for item in select value from jsonb_array_elements(batch) loop
    ticker_value := item ->> 'ticker';
    if ticker_value is null then
      continue;
    end if;

    begin
      delete from public.dividend_payments where ticker = ticker_value;

      insert into public.dividend_payments (ticker, ex_date, payment_date, type, value_per_share)
      select
        ticker_value,
        p.ex_date,
        p.payment_date,
        coalesce(p.type, 'Provento'),
        p.value_per_share
      from jsonb_to_recordset(coalesce(item -> 'payments', '[]'::jsonb))
        as p(ex_date date, payment_date date, type text, value_per_share numeric);

      get diagnostics inserted_now = row_count;
      inserted := inserted + inserted_now;
      replaced := replaced + 1;
    exception when others then
      -- Subtransação desfeita: o ticker fica como estava. Guarda o motivo.
      failed := failed || jsonb_build_object('ticker', ticker_value, 'error', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('replaced', replaced, 'inserted', inserted, 'failed', failed);
end;
$$;

-- RPC em `public` nasce executável por qualquer papel do PostgREST. Esta
-- escreve numa tabela cuja RLS só dá SELECT — chamá-la como `authenticated`
-- passaria por cima da policy. Só o service role (o cron) executa.
revoke execute on function public.replace_dividend_payments(jsonb) from public, anon, authenticated;
grant execute on function public.replace_dividend_payments(jsonb) to service_role;
