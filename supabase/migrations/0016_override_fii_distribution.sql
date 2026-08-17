-- Ajuste manual de DISTRIBUIÇÃO, para fundo.
--
-- `ceiling_overrides` nasceu para ação: `payout` e `manual_profit`. Fundo
-- listado não apura lucro por cota, então o botão "Ajustar" na aba Fundos
-- abria um formulário pedindo "Lucro por ação esperado" — pergunta sem
-- resposta possível, e o `reportedEps` devolvia `undefined` porque fundo não
-- tem `shares_outstanding`. Na prática o ajuste nunca funcionou ali.
--
-- A Beca pediu o equivalente certo em 2026-08-17: corrigir a DISTRIBUIÇÃO
-- quando o valor puxado automaticamente não reflete a realidade do fundo.
--
-- Guardamos o ANUAL, não o mensal que o formulário mostra. O teto é
-- `distribuído12m ÷ yield`, então o anual é o que a conta consome direto — e
-- `dividends_12m` em `company_fundamentals` já é anual. Manter as duas
-- grandezas na mesma unidade evita a classe de erro que este projeto já teve
-- com escala (a bolsai em milhares). O formulário multiplica por doze na
-- entrada e divide na exibição, e isso fica visível lá.
--
-- Mesma regra de escopo do resto da tabela: `user_id` nulo é ajuste global da
-- Beca, e o índice `unique nulls not distinct (user_id, ticker)` já cobre.

alter table public.ceiling_overrides
  add column if not exists manual_dividends_12m numeric(18, 6)
    check (manual_dividends_12m is null or manual_dividends_12m > 0);

comment on column public.ceiling_overrides.manual_dividends_12m is
  'Distribuição anual por cota digitada à mão, em reais. Vence o dividends_12m do banco no cálculo do teto de fundo. O formulário fala em valor MENSAL e converte.';
