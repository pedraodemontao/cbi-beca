-- Meta de renda passiva da usuária.
--
-- A calculadora de renda passiva já existia, mas solta: perguntava "quanto você
-- quer receber por mês" e ignorava a carteira. Guardando a meta dá pra
-- responder o que ela realmente quer saber — quanto FALTA — e mostrar isso no
-- resumo toda vez que ela entra, não só quando abre a calculadora.
--
-- Mora em `profiles` e não em tabela nova: é um valor por usuária, e a RLS de
-- `profiles` já está montada.

alter table public.profiles
  -- R$ por mês que ela quer receber de provento. Nulo = ainda não definiu.
  add column income_goal numeric(14, 2) check (income_goal is null or income_goal > 0);
