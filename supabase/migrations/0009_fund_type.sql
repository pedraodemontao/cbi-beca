-- Tipo real do fundo listado.
--
-- Fiagro e FI-Infra pagam renda mensal igual a FII, entram na mesma conta de
-- preço teto (rendimento ÷ yield desejado) e a bolsai cobre os três. Mas
-- chamá-los de "fundo imobiliário" na tela seria errado, e a plataforma é
-- educativa.
--
-- A saída é separar bucket de rótulo: `asset_type` continua sendo a categoria
-- de mercado que agrupa ('fii' = fundo listado, o balde), e `fund_type` diz o
-- que a coisa É de verdade — é ele que aparece como selo na linha.
--
-- Assim `positions.asset_type` (que é um enum do Postgres com 'stock' e 'fii')
-- não precisa mudar, e nenhuma posição já cadastrada é afetada.

alter table public.companies
  add column fund_type text;

-- Quem já está no catálogo é FII de verdade: a sincronização só aceitava
-- subType 'fii' até agora.
update public.companies set fund_type = 'FII' where asset_type = 'fii';
