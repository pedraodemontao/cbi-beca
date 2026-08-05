-- Carimbo próprio pro balanço.
--
-- `company_fundamentals` é escrita por três sincronizações diferentes (balanço
-- da CVM, proventos e ficha de FII) e todas bumpam o `updated_at` da linha. Com
-- isso a regra "não reconsultar quem tem fundamento fresco" passou a olhar pro
-- carimbo errado: bastava a sincronização de proventos tocar a linha pra que o
-- balanço parecesse recém-buscado e nunca mais fosse atualizado.
--
-- Medido em 2026-08-05: das 382 ações do catálogo, 270 estavam nesse estado e o
-- cron de fundamentos pediu só 112.

alter table public.company_fundamentals
  add column fundamentals_updated_at timestamptz;

-- Quem já tem balanço no banco herda o carimbo atual; quem não tem fica nulo e
-- entra na fila da próxima sincronização.
update public.company_fundamentals
  set fundamentals_updated_at = updated_at
  where shares_outstanding is not null;
