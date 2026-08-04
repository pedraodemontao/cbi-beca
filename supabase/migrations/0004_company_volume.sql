-- Volume negociado do dia, vindo do `/quote/list` da brapi.
--
-- Sem ele o ranking de preço teto sobe papel morto ao topo: EQPA7 e BNBR3
-- negociaram 200 ações num dia em que PETR4 negociou 25 milhões, e o preço
-- parado deles produz margem de +1.400% que não existe na vida real.

alter table public.companies
  add column volume bigint;
