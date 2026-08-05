-- Proventos anunciados e qualidade do lucro — o que a chave Pro da bolsai abriu.
--
-- Até aqui "próximos proventos" só existia pros quatro tickers de sandbox da
-- brapi, e o histórico de pagamento vinha do Yahoo em tempo de pageview. Com
-- `/dividends/{ticker}` e `/fiis/{ticker}/distributions` o dado é oficial e cabe
-- no banco: a tela lê daqui e não depende de nenhuma API estar de pé.

create table public.dividend_payments (
  ticker text not null references public.companies (ticker) on delete cascade,
  -- Data-com: quem tinha o ativo antes dela recebe, mesmo que o depósito caia
  -- semanas depois. É por ela que se decide o que a usuária tem direito a
  -- receber. Em FII a bolsai informa a competência mensal, que entra aqui.
  ex_date date not null,
  -- Data do depósito. No futuro = provento anunciado e ainda a receber, que é
  -- o que alimenta "próximos proventos".
  payment_date date,
  -- 'Dividendo', 'JCP' ou 'Rendimento'. JCP tem 15% de IR na fonte e dividendo
  -- não — separar aqui é o que permite a tela avisar. Sem nulo pra chave
  -- primária composta fechar.
  type text not null default 'Provento',
  value_per_share numeric(18, 8) not null check (value_per_share > 0),
  updated_at timestamptz not null default now(),
  primary key (ticker, ex_date, type, value_per_share)
);

-- "O que ainda vou receber" varre por data de pagamento, não por ticker.
create index dividend_payments_payment_date_idx
  on public.dividend_payments (payment_date desc nulls last);

alter table public.dividend_payments enable row level security;

-- Dado público de mercado: qualquer pessoa logada lê, só o cron escreve
-- (service role ignora RLS, então basta não existir policy de escrita).
create policy "dividend_payments_select_authenticated" on public.dividend_payments
  for select to authenticated using (true);

create trigger dividend_payments_set_updated_at
  before update on public.dividend_payments
  for each row execute function public.set_updated_at();

alter table public.company_fundamentals
  -- Quantos anos fechados entraram na média do Bazin. Sem isso a tela diz
  -- "média de 5 anos" pra empresa que abriu capital há três.
  add column dividends_years smallint,
  -- Razão 0-1, direto da fonte — não recalcular a partir do preço do catálogo.
  add column dividend_yield_ttm numeric(12, 6),
  -- Mediana do lucro TTM dos últimos trimestres, em reais.
  --
  -- É o que transforma a flag de lucro atípico em medida honesta: até agora o
  -- critério era P/L < 6, um proxy. PETR4 oscilou de LPA 2,84 pra 10,13 em dois
  -- trimestres — comparar o lucro de hoje com a própria mediana histórica pega
  -- o pico sem depender do payout que a usuária escolheu.
  add column net_income_median numeric(22, 2),
  add column net_income_median_quarters smallint,
  -- 'bolsai' ou 'yahoo'. A tela precisa saber quando o número é oficial.
  add column dividends_source text;

alter table public.companies
  -- Segmento do FII ('Logística', 'Títulos e Val. Mob.', 'Lajes Corporativas').
  -- Tijolo x papel é A distinção de FII, e o `sector` da brapi não faz essa
  -- separação — devolve todos como fundo imobiliário.
  add column segment text;
