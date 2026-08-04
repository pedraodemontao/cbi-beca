<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# beca-carteira

Ferramenta web de acompanhamento de carteira de investimentos (ações B3 + FIIs) com chat de IA na persona da Beca Alcântara. Sem Open Finance — usuário cadastra posições manualmente.

## Stack

Next.js 16 (App Router, TypeScript, `src/`), Tailwind v4, Supabase (Auth + Postgres + RLS), brapi.dev (catálogo e cotação), bolsai (fundamentos da CVM), Anthropic (chat). Deploy: Vercel (**plano Hobby**).

## Decisões registradas

- **Next 16 usa `src/proxy.ts`** (rename de middleware): export `proxy()` + `proxyConfig`. Helper em `src/lib/supabase/proxy.ts`.
- **Código em inglês, UI em português.** Colunas do banco em `snake_case` inglês (`avg_price`, `asset_type`), tipos TS em `camelCase`.
- **`asset_type` enum `('stock','fii')`** — 'fii' é nome próprio, mantido.
- **`profiles.id` = `auth.users.id`** (PK e FK juntas, convenção Supabase). Profile criado por trigger no signup.
- **`positions` sem unique(user_id, ticker)** — permite múltiplos lotes do mesmo ticker.
- **Preço/indicador de mercado NUNCA vai pro banco** — sempre ao vivo da brapi com cache via `fetch` + `next: { revalidate }` (quote 2min, statistics/historical 1h, dividends 6h, tickers 24h).
- **brapi só server-side** (`server-only` em `src/lib/brapi.ts`), token via header Bearer. Falha → retorna `null`, UI mostra "dado indisponível".
- **Shapes da brapi v2 validados com token real (2026-08-03):** payload vem em `results[0].data` (quote, statistics, historical) e em `results[0].data.cashDividends` (dividendos de ação); `/v2/fii/dividends` foge do padrão e devolve `{ dividends: [...] }` achatado. `/v2/tickers` devolve `results[]` com `assetType` (`stock` | `fund`) + `subType` (`fii`) — não existe campo `type`.
- **Limites do plano free da brapi (medidos em 2026-08-03):**
  - **1 ticker por requisição** (`QUOTES_PER_REQUEST_EXCEEDED` em lote). `getQuote` faz fan-out com `Promise.all`; ticker que falha some do resultado sem derrubar os demais.
  - **`historical` só aceita `1d`, `5d`, `1mo`, `3mo`** — daí o tipo `HistoricalRange` restrito. Pedir `6mo`+ dá `INVALID_RANGE`.
  - **`statistics` (módulo `defaultKeyStatistics`) devolve 403** para tickers comuns.
  - **PETR4, MGLU3, VALE3 e ITUB4 são tickers de sandbox** com acesso total (statistics e ranges longos funcionam). Ao testar indicadores, usar um deles — o resto do catálogo só responde `quote`, `historical` curto e `dividends`.
  - Consequência: `/carteira` e `/resumo` funcionam com qualquer ticker; a página de ativo mostra indicadores só nos de sandbox (ou com plano pago). Todos os componentes degradam com mensagem em pt-BR, sem quebrar.
- **Chaves:** anon key do Supabase é pública por design (RLS protege). `SUPABASE_SERVICE_ROLE_KEY`, `BRAPI_TOKEN`, `BOLSAI_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET` só server-side.
- **Persona do chat** em `prompts/system.md` — derivada das seções VOZ + PROIBIDO de `beca-painel/api/_beca.js` (sem o FORMATO de Reels). Regra inegociável: IA nunca recomenda comprar/vender/manter; nunca calcula números (recebe prontos via `CONTEXTO_CARTEIRA`).
- **Formulários via Server Actions + `useActionState`** (validação Zod nos dois lados). React Hook Form entra só se algum form crescer em complexidade.
- **Direção visual escolhida: "Amiga Professora"** (light acolhedor). Fundo creme `#FAF7F2`, verde-folha `#1B7A4E`, amarelo-manteiga `#FCF0CE` (só fundo, nunca texto), coral `#BE3A2B` pro negativo. Fonte **Plus Jakarta Sans**. Tema claro único — sem `dark:` variants.
- **Design system em 3 camadas no `globals.css`**: primitivos `--beca-*` → semânticos (`--background`, `--primary`…) → utilities via `@theme inline` do Tailwind v4. **Nunca usar hex solto em componente** — sempre classe de token (`bg-surface`, `text-positive`, `border-border`…).
- **Princípio da direção: didática embutida.** Todo número importante leva `.micro-label` (rótulo) + `.micro-hint` (explicação em voz de amiga: "quanto teu dinheiro vale hoje, tudo somado"). Posição em queda mostra acolhimento, não alarme.
- **Classes de componente:** `.card`, `.card-lg`, `.field`, `.btn-primary`, `.btn-ghost`, `.chip`/`.chip-up`/`.chip-down`, `.micro-label`, `.micro-hint`, `.num` (tabular-nums em todo número).
- **Navegação:** `BottomNav` fixa no mobile (Carteira · Resumo · Chat), vira pill bar centralizada no desktop. Páginas com bottom-nav precisam de `pb-28 sm:pb-8` no main.
- **Semântica de mercado:** alta = `text-positive` (verde), queda = `text-negative` (coral); badge Ação = chip verde, FII = chip manteiga.
- **Confirmação de e-mail:** rota `/auth/confirm` aceita os dois fluxos (`token_hash` do guia server-side E `?code=` do template padrão PKCE).

## Roadmap (ordem de prioridade)

1. ✅ Fase 1 — setup: scaffold, libs, migration, persona, schemas
2. ✅ Auth (cadastro/login Supabase, server actions, `/auth/confirm`)
3. Onboarding leve — resolvido pelo estado vazio da `/carteira` (BecaTip + CTA), sem tela dedicada
4. ✅ Minha Carteira (cards didáticos com preço ao vivo + form com autocomplete + remover)
5. ✅ Resumo (`/resumo`: KPIs, composição, próximos proventos)
6. ✅ Página de ativo (`/ativo/[ticker]`: gráfico SVG, indicadores traduzidos, proventos)
7. ✅ Chat de IA (`/chat` + `/api/chat`, streaming via `useChat`, disclaimer no topo)

8. ✅ Calculadoras (`/calculadoras`: juros compostos + renda passiva)
9. ✅ Proventos (`/proventos`: total já recebido, mês a mês, quem mais paga)

## Tese do produto (definida em 2026-08-03)

**Montar a carteira e ver os dividendos pingando.** O ângulo de dolarização foi
descartado — ficou fundo de funil demais pra comunicação da Beca. Toda decisão de
produto deve reforçar: cadastrar ativos é fácil, e o provento é a recompensa
visível de quem segura.

- **Proventos recebidos são CALCULADOS, nunca digitados** (`lib/dividend-income.ts`): para cada pagamento anunciado depois da compra, valor = `rate × quantity`. Zero trabalho manual pra usuária.
- Sem `purchase_date`, o cálculo cai no `created_at` — **subestimar é mais honesto que inflar**. A UI avisa e convida a preencher a data.
- `estimatedMonthlyIncome` = o que os ativos pagaram por cota nos últimos 12 meses aplicado à quantidade de hoje ÷ 12.

CRUD de posições completo: adicionar, **editar** e remover. `loading.tsx` em carteira/resumo/ativo; `error.tsx` e `not-found.tsx` na raiz.

- **Posições são consolidadas por ticker na UI** (`groupByTicker` em `lib/portfolio.ts`): duas compras de PETR4 viram um card só, com preço médio ponderado e os lotes expansíveis pra editar/remover individualmente. O banco continua guardando lote a lote.
- **Calculadoras são 100% client-side** — não gravam nada e não chamam API. Ambas trazem aviso de que simulação não é promessa de retorno.
- **CDI/SELIC/IPCA vêm da API pública do Banco Central** (`lib/bcb.ts`, séries SGS 12/11/433) — grátis e sem chave. O `/v2/macro` da brapi é 403 no plano free. Taxas diárias são **compostas**, nunca somadas.
- **Snapshots de patrimônio** (`portfolio_snapshots`, migration 0002): o cron `/api/cron/snapshot` roda 22h UTC em dias úteis (`vercel.json`), usa service role e grava um registro por usuário/dia. RLS dá só SELECT ao dono — escrita é exclusiva do cron. Proteger com `CRON_SECRET` em produção.

## Preço Teto — a função principal (pivô de 2026-08-04)

A plataforma passa a girar em torno de **preço teto**, não da carteira. Referências
que a Beca mandou: aba "Preço Teto Projetado" do Adapta Valuer e o Financial Hub
do Felipe Eduardo. Carteira, resumo e proventos viram abas secundárias.

**Fórmula, decodificada do print e conferida no centavo:**

```
LPA  = lucro ÷ qtd de ações
DPA  = LPA × payout            (payout editável, padrão 60%)
PT   = DPA ÷ yield desejado    (6%, 8%, 10%) → arredonda pro múltiplo de R$ 0,50
margem = (PT − cotação) ÷ cotação
```

O arredondamento pra R$ 0,50 não é enfeite: sem ele as margens não batem com as
plataformas de referência. Graham = √(22,5 × LPA × VPA); Gordon = D₁ ÷ (k − g).

- **`lib/ceiling-price.ts` é 100% função pura** — sem rede, sem banco. É o que
  permite recalcular a tabela inteira no client quando a usuária mexe no payout.
  Empresa no prejuízo devolve `null`, nunca preço teto negativo.
- **Fonte de fundamentos é a bolsai** (`lib/bolsai.ts`), não a brapi. O plano free
  da brapi dá 403 em `defaultKeyStatistics` fora do sandbox, e o Startup (R$ 99,99)
  também não inclui o módulo — sem `sharesOutstanding` a única saída seria
  aproximar por `marketCap ÷ preço`, que **erra 7,67%** e move o preço teto de
  PETR4 de R$ 84,00 pra R$ 78,00. bolsai Pro custa R$ 49/mês contra R$ 116,66 da
  brapi Pro e cobre small cap (AXIA3 responde normal, sem sandbox).
- **Unidades da bolsai (medidas em 2026-08-04):** `net_income`, `equity`,
  `net_revenue`, `ebitda` vêm em **milhares de reais** (convenção CVM);
  `close_price` e `market_cap` vêm em **reais**. `lib/bolsai.ts` normaliza tudo
  pra reais na ingestão — nenhum consumidor deve reconverter.
- **`/fundamentals/{ticker}` não aceita lote**: uma requisição por ticker. Por isso
  a sincronização ordena por valor de mercado — se a cota do dia acabar no meio,
  as empresas que a usuária procura já estão no banco. Free = 200 req/dia,
  Pro = 10.000.
- **Exceção consciente à regra "preço nunca vai pro banco":** `companies` guarda
  cotação porque ranquear 400 ativos ao vivo a cada pageview é inviável. É cache
  com carimbo (`price_updated_at`), não verdade — a tela usa preço ao vivo e só
  cai pro valor gravado quando a brapi não responde.
- **`brapi /quote/list` é o catálogo** — endpoint v1 (não existe na v2), único que
  o plano free serve em lote: 2.000 ativos com setor, logo e cotação numa
  requisição só. 748 ações, 588 FIIs, 664 BDRs.
- **Vercel Hobby permite só 2 crons por projeto**, 1×/dia. Daí `/api/cron/market`
  rodar catálogo **e** fundamentos em sequência (`lib/market-sync.ts`), com
  `/api/cron/catalog` e `/api/cron/fundamentals` sobrando pra depuração manual.
- **Defasagem é inerente:** `reference_date` da CVM em 04/08/2026 ainda era
  2026-03-31. A UI **precisa** exibir a data do balanço, senão a usuária acha que
  o lucro é de hoje.
- **Lucro TTM distorce em cíclica e banco:** PETR4 projeta D/Y de 11,82% por causa
  de não-recorrente. Precisa de flag de outlier antes de a tabela ir pro ar.
- **`ceiling_overrides` usa `unique nulls not distinct (user_id, ticker)`** —
  `user_id` nulo é override global da Beca, visível pra todo mundo.
- **Fracionário (`PETR4F`) não entra no catálogo** (`FRACTIONAL_TICKER` em
  `lib/market-sync.ts`): é a mesma empresa do papel cheio e a bolsai devolve 422
  em todos. Medido em 2026-08-04: eles torraram 76 das 150 requisições diárias
  antes do filtro existir.
- **A sincronização pula quem tem fundamento gravado há menos de 7 dias.** O
  balanço só muda quando sai ITR novo — sem isso, todo dia a cota ia embora
  reconsultando as mesmas líderes de valor de mercado e a cauda nunca entrava.
- **A tabela usa a cotação gravada em `companies`, não preço ao vivo.** O free da
  brapi serve 1 ticker por requisição: ranquear centenas ao vivo é impossível.
  Preço ao vivo continua exclusivo de `/carteira`, `/resumo` e `/ativo`.
- **Piso de liquidez de R$ 1 milhão negociado no dia** (`volume × preço`,
  migration 0004). Sem ele o ranking por margem é lixo: EQPA7 e BNBR3 trocaram
  200 ações num pregão em que PETR4 trocou 25 milhões, e o preço parado deles
  inventava margem de +1.487%. O toggle vem ligado, mas desligar devolve tudo
  com selo "pouco negociada" — a tabela protege, não esconde.
- **Flag de lucro atípico é P/L < 6, não D/Y alto.** O D/Y projetado depende do
  payout, e o selo não pode piscar a cada arrasto do slider. PETR4 fica em 5,1 e
  é pega; JHSF3, CYRE4 e SUZB3 também.
- **Não existe ordenar por dividendo projetado:** como o teto é o DPA dividido
  pelo yield, margem e D/Y produzem exatamente a mesma lista. As ordenações são
  margem, valor de mercado e alfabética.
- **O ajuste manual é digitado em lucro POR AÇÃO, não lucro total.** Ninguém
  digita "107583000000" pra falar da Petrobras. A action multiplica pelas ações
  do banco antes de gravar `manual_profit` — a quantidade nunca vem do
  formulário, senão dava pra forjar o teto de qualquer empresa.
- **Ajuste salvo congela o payout daquela linha.** O slider global deixa de
  valer pra ela (é o que o selo "teu ajuste" comunica); "Voltar ao padrão"
  apaga o override e devolve a linha ao slider.
- **`clearCeilingOverride` filtra por `user_id` explícito** — a RLS deixa a
  usuária LER os ajustes globais da Beca, e sem o filtro um delete tentaria
  levá-los junto.
- **As abas trocam as colunas, não a tabela.** Cada método devolve uma lista de
  colunas (`buildColumns`) e a coluna marcada `strong` vira o teto que manda na
  margem, na ordenação e no número grande do card no mobile. Adicionar método
  novo é escrever um `case`, não outra tabela.
- **O slider de payout só aparece em Projetado e Gordon.** Graham parte de LPA e
  VPA — deixar o controle na tela sugeriria que mexer nele muda o resultado.
- **Gordon com crescimento ≥ retorno exigido não mostra teto:** a fórmula
  explodiria pro infinito. A tela avisa e as linhas viram "sem teto".
- **FII usa `/fiis/` da bolsai — UMA requisição pra lista inteira** (o endpoint
  aceita `limit` até 5.000). Por isso `syncFiis` roda ANTES de `syncFundamentals`
  no cron: se a cota acabar, o que fica pela metade é a cauda das ações.
- **O rendimento do FII é gravado em `company_fundamentals.dividends_12m`** —
  não precisou de tabela nova. Quando a bolsai só devolve o yield, o R$/cota sai
  de `yield × preço`; yield acima de 1 é tratado como percentual (FII com 100%
  ao ano não existe).
- **Os campos de `/fiis/` não são documentados** — `lib/bolsai.ts` aceita
  apelidos (`dy`, `dividend_yield`, `dy_12m`…) via `pickNumber`. Assim que a
  cota renovar, conferir o payload real e enxugar a lista.
- **Dividendo pago vem do Yahoo** (`lib/yahoo.ts`), não da bolsai nem da brapi —
  as duas fecharam esse dado no plano gratuito. **Não mandar User-Agent de
  navegador:** fingir Chrome a partir do servidor faz o Yahoo devolver 429 em
  toda chamada; com os headers padrão do runtime volta 200. Rajada também leva
  429, daí duas conexões e pausa de 250ms em `syncDividends`.
- **A data que o Yahoo devolve é a data-com, não a do depósito.** Pro cálculo de
  "quanto já pingou desde a compra" isso é mais correto, porque é ela que decide
  quem tem direito ao pagamento.
- **Uma requisição ao Yahoo devolve 12 meses E 5 anos de dividendo**
  (`range=5y&interval=1mo` — o intervalo mensal corta o payload sem perder
  nenhum evento de dividendo). A média de 5 anos é a base do Bazin original, e
  as duas divergem bastante: BBAS3 pagou R$ 0,55 no último ano contra média de
  R$ 1,63, e PETR4 o oposto (R$ 2,99 contra R$ 7,99 da bonança de 2022-23).
- **Sparkline de 30 dias vem de `companies.price_history`** (migration 0005,
  `numeric[]`): 30 números sempre lidos juntos e sempre substituídos por
  inteiro — tabela de série temporal só traria join sem ganho. O Postgres
  devolve `numeric[]` como string, daí o `Number()` na leitura.
- **`syncPriceHistory` reenvia `name` e `asset_type` no upsert** porque o
  PostgREST monta um INSERT antes de cair no ON CONFLICT, e as duas são NOT NULL.
- **O cron combinado limita dividendos a 250 e histórico a 100** — o catálogo
  inteiro leva ~7 minutos no ritmo que o Yahoo tolera, e a função morre em 300s.
  Cobertura total é pelas rotas dedicadas.
- **O ranking de dividendos exclui quem pagou mais de 15% do preço em 12 meses**
  e diz quantos tirou. Sem isso o topo inteiro vira venda de ativo e devolução
  de capital — chegava a 63% ao ano, que ninguém recebe duas vezes.
- **Nunca escrever "a ação está X% abaixo do teto".** Margem é (teto − preço) ÷
  preço: com margem de +96%, o TETO é 96% maior que a cotação — a ação não está
  96% abaixo dele. O chat já errou isso uma vez; o `CONTEXTO_PRECO_TETO` e o
  card do ativo agora usam a frase "o teto é X% maior/menor que a cotação".

### Etapas do Preço Teto

1. ✅ Migrations 0003, `lib/bolsai.ts`, `lib/ceiling-price.ts`, `lib/market-sync.ts`, crons
2. ✅ `/preco-teto` — tabela do print (Projetado), payout em slider recalculando
   no client, busca, ordenação, flag de lucro atípico e data do balanço à vista
3. ✅ Payout e lucro manual salvando por usuária (`ceiling_overrides`)
4. 🟡 Abas: Graham e Gordon ✅ — **Bazin bloqueado por assinatura** (precisa de
   dividendos pagos; a aba existe e explica a ausência em vez de inventar número)
5. 🟡 FII — código pronto (`syncFiis`, aba própria na tabela, `/api/cron/fiis`),
   **falta rodar a sincronização** (cota da bolsai zerou; renova à meia-noite UTC)
6. ✅ Sparkline de 30 dias (migration 0005) + ranking de dividendos (`/proventos`)
7. ✅ Preço Teto vira a home

### Feito além do roadmap (para a demo)

- **Preço teto na página do ativo** (`components/ativo/ceiling-card.tsx`): os
  quatro números do ticker aberto, com preço ao vivo da brapi.
- **Carteira ↔ preço teto**: cada posição mostra se a cotação está abaixo do
  teto, com link pra página do ativo.
- **Filtros da tabela**: setor, "só abaixo do teto" e "só o que eu tenho"
  (marca as posições da usuária com selo).
- **Chat sabe do preço teto** (`CONTEXTO_PRECO_TETO` em `/api/chat`): a Beca
  responde "a PETR4 está abaixo do teto?" com o número já calculado.

## Pendências conhecidas

### O que a bolsai serve em cada plano (sondado em 2026-08-04)

Free (200 req/dia) — `/companies/`, `/fiis/`, **`/fiis/{ticker}`**, `/fundamentals/{ticker}`.
Pro (10.000 req/dia, ~R$ 29/mês) — `/dividends/{ticker}`, `/fiis/{ticker}/distributions`,
`/fiis/screener`, `/financials/{ticker}`, `/fundamentals/{ticker}/history`, `/macro/`.

- **`/fiis/{ticker}` é FREE e devolve DY, P/VP, NAV e cotistas** — ou seja, o
  preço teto de FII (etapa 5) NÃO depende de assinatura: dividendo 12m sai de
  `preço × DY`. Só a série mensal de distribuições é que é Pro.
- **Bazin de ação continua preso ao Pro**: `/dividends/{ticker}` é a única fonte
  de dividendo pago de ação que sobrou (a brapi restringiu ao sandbox).
- A checagem de tier acontece ANTES do rate limit — dá pra descobrir o que é Pro
  mesmo com a cota do dia estourada.

- **bolsai ainda no plano free (200 req/dia)** — o teto bate exatamente em 200
  e o cron para sozinho com `halted: 'rate_limited'`. Em 2026-08-04 o banco
  ficou com **111 empresas** (105 com teto calculável); a cauda entra nos dias
  seguintes, ~200/dia, ou de uma vez com o Pro (R$ 49/mês).
- **5 ações não-fracionárias também deram 422 na bolsai** — provavelmente sem
  demonstração na CVM. Investigar se virar padrão.
- **`/dividends`, `/financials` e `/screener` da bolsai não foram testados** —
  dão 403 no free. Validar quando a chave virar Pro (bloqueia a etapa do Bazin).
- **DIVIDENDOS SÓ EXISTEM NO SANDBOX DA BRAPI (medido em 2026-08-04).**
  `/v2/stocks/dividends?symbols=PETR4` responde; o mesmo endpoint com ITSA4 dá
  `FEATURE_NOT_AVAILABLE`, e o módulo `dividends` do `/quote` foi removido do
  free até pros tickers de sandbox. `defaultKeyStatistics` idem: só sandbox.
  Consequência: `/proventos` e "próximos proventos" do `/resumo` só mostram algo
  pra quem tem PETR4, VALE3, ITUB4 ou MGLU3 na carteira — o resto degrada com a
  mensagem em pt-BR. **Destravar dividendos exige assinatura** (bolsai Pro
  R$ 49/mês ou brapi paga), e é o mesmo bloqueio da aba Bazin e do preço teto
  de FII.
- **Confirmação de e-mail está LIGADA no Supabase** — signup não devolve sessão até o usuário confirmar. Desligar em Authentication → Sign In/Up → Email para agilizar o desenvolvimento.
- **Usuário de teste criado em 2026-08-03:** `qa.carteira.teste@gmail.com` (não confirmado). Apagar em Authentication → Users quando quiser.
- Chat não persiste histórico entre recarregamentos (não estava no escopo).
- **A cotação de `companies` é do fechamento do dia da sincronização.** Papel
  ilíquido fica com preço de dias atrás mesmo assim — daí o piso de liquidez.
- **Gráfico de evolução só ganha forma depois de 2+ dias de cron** — e o cron da Vercel só roda em produção.

## Fora do alcance da brapi (verificado em 2026-08-03)

- `/v2/macro`, `/v2/prime-rate`, `/v2/inflation` → **403 no plano free** (resolvido via API do Banco Central).
- **Tesouro Direto e notícias não existem na brapi v2** (404). Tesouro exigiria o CSV do Tesouro Transparente; notícias, outra fonte inteiramente.
- **Open Finance** exige contrato com agregador certificado (Pluggy/Belvo) + habilitação no Banco Central — semanas de prazo e custo recorrente, não é tarefa de código.

## QA obrigatório antes de entregar

Responsivo mobile · loading states nas chamadas brapi · nenhuma chave secreta no bundle (`next build` + conferir) · disclaimer educacional em 3 lugares (rodapé, chat, página de ativo).

## Comandos

- `npm run dev` / `npm run build` / `npm run lint`
- Migrations: aplicar os `supabase/migrations/*.sql` em ordem no SQL Editor do projeto Supabase (ou `supabase db push` se CLI vinculada).
- **Ligar os FIIs (pendente):** `curl "localhost:3000/api/cron/fiis?limit=500"` —
  custa 1 requisição. Rodar depois da meia-noite UTC (21h de Brasília), quando a
  cota da bolsai renova, e conferir se `saved` > 0; se vier `withoutYield` alto,
  os apelidos de campo em `lib/bolsai.ts` precisam de ajuste.
- Popular o preço teto localmente: `curl "localhost:3000/api/cron/catalog"` e depois `curl "localhost:3000/api/cron/fundamentals?limit=200"` (o `limit` respeita a cota diária do plano free da bolsai; quem já tem fundamento fresco é pulado, então rodar de novo no dia seguinte avança a fila em vez de repetir).
