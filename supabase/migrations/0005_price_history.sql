-- Fechamentos dos últimos 30 dias, pra sparkline da tabela de preço teto.
--
-- Vai como array no próprio catálogo em vez de tabela de série temporal: são no
-- máximo 30 números por ativo, sempre lidos juntos e sempre substituídos por
-- inteiro na sincronização. Tabela separada só traria join sem ganho nenhum.

alter table public.companies
  add column price_history numeric(18, 4)[];
