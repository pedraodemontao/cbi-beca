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
- **O produto se chama CENTRAL CBI** (rebrand de 2026-08-06, era "Carteira da Beca"). A **Beca continua sendo a voz** — chat, dicas e tom são dela; CBI é a marca do sistema. Por isso existem dois símbolos: `BrandMark` (a logo — hexágono em ouro com o monograma e a seta de alta, institucional) e `BecaAvatar` (disco cheio com "B", pessoa). O `BrandMark` era monograma em texto até a logo em arquivo chegar, em 2026-08-11.
- **Direção visual: preto, ouro e verde de detalhe.** Fundo `#08080A`, card `#141419`, ouro `#D6A93C` (marca), verde `#3FBF87` (alta), coral `#F0705F` (queda), texto `#F4F1E8`. Fonte **Plus Jakarta Sans** (mantida: serifa de luxo prejudica leitura de número). O escuro é a direção de origem; desde 2026-08-11 existe tema claro por escolha da usuária — mas **sem `light:`/`dark:` variants**, a troca é toda na camada semântica.
- **No escuro a separação de superfície NÃO vem da luz.** Preto e card diferem só 1,09:1 — abaixo do que o olho separa. Quem desenha o card é a **borda** (`#2E2E38`), e é por isso que `.card` e `.card-lg` ganharam `border` nesta direção. Sombra vira profundidade, não delimitação.
- **Contraste medido, não estimado:** todo texto sobre o fundo em que aparece está em 4,5:1 no mínimo, a maioria acima de 7:1. Ouro sobre preto 9,15:1; preto sobre ouro 9,15:1; verde 8,59:1; coral 6,85:1.
- **Design system em 3 camadas no `globals.css`**: primitivos `--cbi-*` → semânticos (`--background`, `--primary`…) → utilities via `@theme inline` do Tailwind v4. **Nunca usar hex solto em componente** — sempre classe de token (`bg-surface`, `text-positive`, `border-border`…).
- **Princípio da direção: didática embutida.** Todo número importante leva `.micro-label` (rótulo) + `.micro-hint` (explicação em voz de amiga: "quanto teu dinheiro vale hoje, tudo somado"). Posição em queda mostra acolhimento, não alarme.
- **Classes de componente:** `.card`, `.card-lg`, `.field`, `.btn-primary`, `.btn-ghost`, `.chip`/`.chip-up`/`.chip-down`, `.micro-label`, `.micro-hint`, `.num` (tabular-nums em todo número).
- **Navegação:** `BottomNav` fixa no mobile (Carteira · Resumo · Chat), vira pill bar centralizada no desktop. Páginas com bottom-nav precisam de `pb-28 sm:pb-8` no main.
- **Semântica de mercado é DESACOPLADA da marca.** Alta = `text-positive` (verde), queda = `text-negative` (coral). Enquanto o verde era a cor primária, `.chip-up` herdava `primary` — quando o ouro virou a marca, isso teria pintado "alta" de dourado. Hoje `.chip-up` sai de `positive-*` e nunca de `primary-*`.
- **Cor de marca nunca vira rótulo de categoria.** O badge de tipo de ativo era `chip-up` (verde) pra ação: ao lado de um número verde, "Ação" lia como "em alta". Ação virou `chip-neutral`, FII ficou no ouro.
- **Texto em cima de ouro usa `text-primary-foreground`, nunca `text-white`** — branco sobre ouro reprova em contraste, preto dá 9,15:1.
- **Confirmação de e-mail:** rota `/auth/confirm` aceita os dois fluxos (`token_hash` do guia server-side E `?code=` do template padrão PKCE).

## Roadmap (ordem de prioridade)

1. ✅ Fase 1 — setup: scaffold, libs, migration, persona, schemas
2. ✅ Auth (cadastro/login Supabase, server actions, `/auth/confirm`)
3. Onboarding leve — resolvido pelo estado vazio da `/carteira` (BecaTip + CTA), sem tela dedicada
4. ✅ Minha Carteira (cards didáticos com preço ao vivo + form com autocomplete + remover)
5. ✅ Resumo (`/resumo`: KPIs, composição, próximos proventos)
6. ✅ Página de ativo (`/ativo/[ticker]`: gráfico SVG, indicadores traduzidos, proventos)
7. ✅ Chat de IA (`/chat` + `/api/chat`, streaming via `useChat`, disclaimer no topo)

8. ✅ Calculadoras (`/calculadoras`: juros compostos, renda passiva, renda de ação e renda de FII)
9. ✅ Proventos (`/proventos`: total já recebido, mês a mês, quem mais paga)
10. ✅ Notícias (`/noticias`: manchetes de 8 portais via RSS, filtro por carteira)
11. ✅ Radar (`/radar`: posição do Ibovespa na faixa de 252 pregões, gráfico e ponteiro)

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
- **Calculadoras não gravam nada e não chamam API externa.** A de FII recebe o
  catálogo do servidor: escolher o fundo já preenche cotação e rendimento, e é
  por isso que ela não precisa do token da brapi que a versão avulsa pede. As
  três trazem aviso de que simulação não é promessa de retorno.
- **A calculadora de FII NÃO aplica piso de liquidez**, ao contrário da tabela
  de preço teto. Lá o filtro protege um ranking que a usuária percorre sem
  escolher; aqui ela digita um ticker que já conhece, e esconder o fundo que ela
  tem seria pior que mostrar preço defasado — ainda mais com a cotação editável.
  São 285 fundos na lista contra 70 se o piso valesse.
- **O rendimento mensal sai da média de 12 meses, não do último pagamento.** FII
  tem mês gordo e mês magro; um mês isolado engana pros dois lados.
- **A calculadora de ação mostra o valor LÍQUIDO, e é o que nenhuma genérica
  consegue.** JCP tem 15% de IR na fonte e dividendo comum não tem; como
  `dividend_payments` guarda o tipo de cada pagamento, dá pra dizer quanto sobra
  de verdade. Não é detalhe: B3SA3, VBBR3, ABCB4 e HYPE3 pagaram **100% em JCP**
  nos últimos 12 meses, então o que cai na conta é 15% menor que o DY sugere.
  Gráfico e projeção usam o mesmo líquido do número em destaque — bruto num
  lugar e líquido no outro faria a usuária achar que a conta está errada.
- **Os selos de DY saem dos quartis reais do catálogo**, medidos em 2026-08-06
  sobre 134 ações líquidas: 3,11% / 5,59% / 8,20%. Não são faixas chutadas.
- **`getCurrentCdiYearly()` devolve PERCENTUAL (14,15), não razão.** Quem
  consome precisa saber — a primeira versão da calculadora multiplicou por 100 e
  ia anunciar CDI de 1.415%.
- **As logos da brapi são ladrilhos opacos 56×56 com fundo próprio** (a da B3 é
  um quadrado azul-marinho). Não precisam de placa clara atrás; `rounded-full`
  só recorta.
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
- **O Yahoo (`lib/yahoo.ts`) virou rede de segurança**, não fonte primária: desde
  a assinatura Pro o dividendo vem da bolsai. Ele ainda serve o histórico de
  preço da sparkline e o provento de ativo que a bolsai não conhece. **Não mandar
  User-Agent de navegador:** fingir Chrome a partir do servidor faz o Yahoo
  devolver 429 em toda chamada; com os headers padrão do runtime volta 200.
  Rajada também leva 429, daí duas conexões e pausa de 250ms.
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
- **Existe UMA conta de margem no app: `safetyMargin` = (teto − preço) ÷ TETO.**
  Enquanto a conta era ÷ preço, "a ação está X% abaixo do teto" era falso (com
  +96%, o TETO é 96% maior que a cotação — a ação não está 96% abaixo dele) e o
  chat chegou a errar isso. Dividindo pelo teto a frase fica correta, e é a
  definição clássica de margem de segurança. **Não reintroduzir a variante ÷
  preço** com o mesmo rótulo: a ambiguidade é que causava o erro.

### Etapas do Preço Teto

1. ✅ Migrations 0003, `lib/bolsai.ts`, `lib/ceiling-price.ts`, `lib/market-sync.ts`, crons
2. ✅ `/preco-teto` — tabela do print (Projetado), payout em slider recalculando
   no client, busca, ordenação, flag de lucro atípico e data do balanço à vista
3. ✅ Payout e lucro manual salvando por usuária (`ceiling_overrides`)
4. ✅ Abas: Graham, Gordon e Bazin — destravado pela chave Pro em 2026-08-05
5. ✅ FII — 280 dos 310 fundos do catálogo com rendimento de 12 meses gravado
6. ✅ Sparkline de 30 dias (migration 0005) + ranking de dividendos (`/proventos`)
7. ✅ Preço Teto vira a home

### bolsai Pro (assinada em 2026-08-05) — o que mudou

A chave passou pro tier Pro: **10.000 requisições/dia** contra 200 (o header
`x-ratelimit-tier` confirma). Isso destravou de uma vez o Bazin, o preço teto de
FII e os proventos de qualquer ticker.

- **`/dividends/{ticker}` é a fonte primária de provento agora**, no lugar do
  Yahoo. Traz data-com, **data de pagamento** e tipo (JCP × Dividendo, que têm
  tributação diferente). A data futura é o que o Yahoo nunca teve: 251 pagamentos
  já anunciados em 99 ativos. O Yahoo continua como rede pra quem a bolsai não
  conhece, marcado em `company_fundamentals.dividends_source`.
- **`dividend_payments` (migration 0006) guarda pagamento a pagamento.** É por
  isso que "próximos proventos" e "quanto já pingou" pararam de chamar API na
  renderização — e passaram a funcionar fora dos quatro tickers de sandbox da
  brapi. 15.841 linhas cobrindo 484 ativos.
- **A média do Bazin usa os ANOS FECHADOS, com buraco valendo zero.** Ano sem
  pagamento some do `annual_summary`, e sem preencher com zero quem parou de
  pagar em 2023 apareceria com a média de quem nunca parou. Empresa que abriu
  capital depois não carrega zeros de antes de existir, e abaixo de 3 anos a
  média não é exibida — `dividends_years` diz quantos anos entraram.
- **`/fiis/` (o endpoint free) foi abandonado**: devolve nome, segmento e número
  de cotistas, zero dado financeiro. Quem vale é `/fiis/screener` (2 requisições
  pros 551 fundos, com VPA, P/VP, NAV e segmento).
- **O `dividend_yield_ttm` do screener vem CORROMPIDO** — RURA11 devolveu
  3,4e15 e `dy_month_pct` chega a 254% ao mês. O rendimento tem que sair de
  `/fiis/{ticker}/distributions`, que é confiável (HGLG11: R$ 11,96/cota, 8,1%).
- **Flag de lucro atípico agora compara com a mediana histórica**, via
  `/fundamentals/{ticker}/history` (até 40 trimestres). O critério antigo era
  P/L < 6, um proxy — e o dado desmentiu ele: PETR4 tem P/L 5,09 mas lucro TTM
  de 0,98× a mediana de 5 anos (é o normal dela, não pode levar selo), enquanto
  TEND3 tem P/L 8,12 e está com 9,5× o lucro de sempre. Corte em 2× pra cima ou
  pra baixo, mínimo de 8 trimestres. O selo tem texto diferente pros dois lados:
  lucro deprimido afunda o teto e faz a ação parecer cara sem estar.
- **A unidade da bolsai NÃO é consistente por ticker** (`profitScale` em
  `lib/bolsai.ts`). A convenção é milhares, mas em VIVA3, MTSA4, RVEE3, HAGA3/4 e
  ESTR4 o valor vem em reais — e a bolsai calcula o `lpa` dela como se fosse
  milhares, então os campos derivados vêm corrompidos na origem: a Vivara
  aparecia com LPA de R$ 2.477,84 (o certo é R$ 2,48) e liderava a tabela com
  margem de +111.114%. Como o artefato é sempre fator 1.000, dá pra escolher a
  leitura plausível: lucro anual acima de 5× o valor de mercado da empresa não
  existe. Por isso `lpa`, `vpa`, `pl` e `pvp` são **recalculados aqui**, nunca
  copiados da resposta.
- **`fundamentals_updated_at` (migration 0007) existe porque três sincronizações
  escrevem em `company_fundamentals`** e todas bumpavam o `updated_at`. A regra
  "não reconsultar quem está fresco" passou a olhar o carimbo errado: bastava a
  sincronização de proventos tocar a linha pro balanço parecer recém-buscado. 270
  das 382 ações estavam nesse estado.
- **Fracionário é detectado por dois sinais** (`isFractional`): o formato pega o
  caso comum, mas erra `MRSA6BF` (fracionário de `MRSA6B`); a presença do papel
  cheio no catálogo pega esse, mas erra quando a brapi lista SÓ o fracionário
  (`AHEB5F`). O regex antigo de quatro letras deixava passar `B3SA3F`.
- **`BOLSAI_TICKER` filtra classe especial da B3** (`MRSA5B`, `EQMA3B`): o
  endpoint só aceita `^[A-Za-z][A-Za-z0-9]{3}\d{0,2}$` e devolve 422 no resto.
- **A ordenação por margem joga o atípico pro fim.** VCJR11 amortizou R$ 165 por
  cota em dois meses (cota de R$ 69) e a conta devolvia margem de +4.080% —
  número real, evento que não se repete. A linha continua na tabela e achável
  pela busca; ela só não lidera. O rótulo virou "Maior margem recorrente".

Cobertura depois da primeira carga completa (2026-08-05): 380 ações e 296 FIIs no
catálogo, 376 ações com balanço, 261 com provento, 280 FIIs com rendimento.

### Pedidos da Beca em 2026-08-06

- **Margem virou MARGEM DE SEGURANÇA: (teto − preço) ÷ TETO**, não ÷ preço.
  É a definição do Graham — desconto sobre o valor justo — e resolve de vez a
  armadilha que a regra antiga tentava contornar com aviso: agora "a ação está
  47,7% abaixo do teto" é literalmente correto. A ordenação não muda (as duas
  contas são monotônicas no mesmo par), só a escala: BRSR6 saiu de +198,0% pra
  +66,6%. O `CONTEXTO_PRECO_TETO` do chat manda o número pronto e proíbe
  recalcular.
- **Cada teto mostra a própria margem** no card do ativo — era o pedido do
  print. `Item` recebe `margin` opcional; LPA e dividendo previsto não são teto
  e ficam sem.
- **FII usa a calculadora da Comunidade da Riqueza**
  (`comunidadedariqueza.com/calculadora-de-preco-teto-de-fundos-imobiliarios`):
  um slider de yield desejado começando em **9% a.a.**, um teto só. Os três
  tetos fixos de 6/8/10 vieram de ação e não separavam fundo nenhum — como FII
  paga 11-13%, todo mundo aparecia com margem parecida contra a régua de 6%.
- **Teto de FII NÃO arredonda pra R$ 0,50** (`fiiCeiling`, separada de
  `bazinCeiling`). O passo de meio real foi calibrado pra ação e distorce cota
  barata: MXRF11 custa R$ 9,43 e o teto de 10% dela sai R$ 10,77, que
  arredondado viraria R$ 11,00 — 2,1% de erro inventado pela régua.
- **A página do ativo tem card próprio de FII** (`FiiCeilingCard`). Antes dizia
  "ainda não tenho o lucro dessa empresa", o que é errado duas vezes: FII não
  tem lucro por cota e o dado não falta. A carteira também passou a usar
  `fiiCeiling` pros fundos, em vez de `buildCeilingProjection` (que devolve nulo).
- **Logo de cada ativo** (`components/shared/asset-logo.tsx`) na tabela, nos
  cards mobile, na carteira e no cabeçalho do ativo. Vem de `logo_url`, que a
  brapi já preenchia pra 100% do catálogo e nunca tinha sido usado. Vai
  `unoptimized`: são ícones de 32px e o plano Hobby tem cota de otimização de
  imagem — passar centenas por pageview queimaria a cota sem economizar byte.
  Iniciais do ticker como fallback, resolvido no client porque a URL só se
  revela quebrada lá.
- **`/preco-teto` é `max-w-7xl`, as outras telas seguem `max-w-5xl`.** Com dez
  colunas num container de 1024px a coluna de margem — que é a que decide tudo —
  ficava escondida no scroll horizontal.

  **Corrigido em 2026-08-12:** esta linha estava certa na intenção e errada no
  código — as outras telas eram todas `max-w-3xl` (768px), e num monitor de
  1455px sobrava mais espaço vazio do que conteúdo. A Beca reclamou disso na
  tela de calculadoras. Larguras hoje: `/preco-teto` 7xl; `/noticias` e
  `/calculadoras` 6xl (as duas que são grade de coisas); o resto 5xl.
- **Alargar o container não basta — o conteúdo precisa de mais colunas.** Nas
  calculadoras, só esticar deixaria quatro cartões empilhados com os campos
  largos no meio de muito branco; o que preenche a tela é a grade de duas
  colunas a partir do `lg`, com `items-start` pra cartão curto não esticar até
  a altura do vizinho. Nas notícias, o masonry ganhou uma quarta coluna no
  `xl`. Carteira e resumo já tinham grade própria e só precisaram do espaço.
- **O chat cresceu por fora e não por dentro.** O container foi pra 5xl junto
  com o resto, mas o balão ganhou `sm:max-w-[38rem]`: 85% de 1024px daria
  linha de ~140 caracteres. Interface acompanha a tela, texto para onde se lê.

### Feito além do roadmap (para a demo)

- **Preço teto na página do ativo** (`components/ativo/ceiling-card.tsx`): os
  quatro números do ticker aberto, com preço ao vivo da brapi.
- **Carteira ↔ preço teto**: cada posição mostra se a cotação está abaixo do
  teto, com link pra página do ativo.
- **Filtros da tabela**: setor, "só abaixo do teto" e "só o que eu tenho"
  (marca as posições da usuária com selo).
- **Chat sabe do preço teto** (`CONTEXTO_PRECO_TETO` em `/api/chat`): a Beca
  responde "a PETR4 está abaixo do teto?" com o número já calculado.

## Funcionalidades de 2026-08-06 (segunda leva)

- **Calendário de proventos** (`/proventos`): o que já foi ANUNCIADO, mês a mês.
  Não é grade de dias de propósito — provento é esparso, e 31 quadradinhos
  vazios no celular não respondem "quanto cai em setembro". A quantidade sai dos
  lotes comprados **até a data-com**: comprar hoje não dá direito a provento cuja
  data-com já passou.
- **Meta de renda** (`profiles.income_goal`, migration 0008): o quanto falta é
  calculado com o rendimento REAL da carteira dela, não com média de mercado.
  Sem carteira ou sem provento a tela diz que não dá pra projetar em vez de
  chutar 8%.
- **Concentração por setor** (`buildSectorConcentration`): o selo de "muito
  concentrada" só aparece a partir de **três ativos distintos**. Quem tem dois
  SEMPRE vai estar concentrada, e ouvir isso no primeiro mês desanima em vez de
  ensinar. O corte é 40% — não é regra de mercado, é o ponto em que a informação
  passa a ser útil pra quem começa.
- **IR de JCP** (`/proventos`): pagamento sem tipo conhecido (o que vem do
  Yahoo) conta como dividendo comum. Supor imposto onde não se sabe seria
  inventar desconto.
- **`companies.fund_type`** (migration 0009) separa **balde de rótulo**:
  `asset_type = 'fii'` é a categoria que agrupa fundo listado, `fund_type` diz o
  que a coisa é (FII, Fiagro, FI-Infra). Foi o que permitiu incluir 33 Fiagro e
  15 FI-Infra sem mexer no enum `positions.asset_type` e sem chamar Fiagro de
  fundo imobiliário na tela. A aba virou "Fundos".
- **`companies.last_seen_at`** (migration 0010): cada sincronização carimba quem
  a brapi ainda lista; quem some por 10 dias sai das telas. **Marcar em vez de
  apagar** — `ceiling_overrides` tem FK pra `companies` e um DELETE levaria junto
  o ajuste da usuária. Saíram 124 ativos, entre eles o EQPA7.
- **`chat_messages`** (migration 0011): só a conversa vai pro banco. O prompt de
  sistema carrega a carteira inteira dela e é remontado a cada pergunta — gravar
  seria guardar um retrato financeiro desatualizado sem motivo.

### Duas armadilhas que custaram caro

- **`min` + `step` em `<input type="number">` invalidam valores no meio.** A meta
  de renda tinha `min="1" step="100"`, o que torna 2000 inválido (válidos seriam
  1, 101, 201…). O browser bloqueia o submit **em silêncio**: `requestSubmit()`
  nem dispara o evento, não aparece requisição na rede e não há erro no console.
  Pra campo de dinheiro, `step="any"`.
- **Rendimento corrompido derruba o lote inteiro.** Parte dos Fiagro devolve
  `dividend_yield_ttm` absurdo em `/distributions` (mesmo defeito do screener);
  o número estourava o `numeric(12,6)` e o PostgREST rejeitava o INSERT todo,
  levando junto os fundos certos. Valor acima de 500% ao ano vira null na
  ingestão (`MAX_PLAUSIBLE_YIELD` em `lib/bolsai.ts`).

## Ajuste da Beca valendo pra todo mundo (2026-08-10)

Pedido dela em áudio: "eu ajusto de tempos em tempos, e quando a pessoa procura
já vê o meu preço teto". Metade já existia desde a migration 0003 — `user_id`
nulo em `ceiling_overrides` é ajuste global e a policy de SELECT já entregava
pra todas. Faltava a escrita: `with check (auth.uid() = user_id)` barrava a
linha com nulo, então a Beca ajustando pela tela salvava algo que só ela via.

- **`profiles.is_curator`** (migration 0012) é o papel de curadora. A policy
  precisa ler `profiles` de dentro de uma policy, e leitura direta com RLS
  ligada entra em recursão — daí `public.is_curator()` ser `security definer`
  com `search_path` fixo.
- **A checagem existe em dois lugares de propósito.** A RLS é a que protege; a
  do `saveCeilingOverride` existe pra devolver português em vez de erro do
  Postgres, e pra que mexer no HTML não publique em nome da Beca.
- **Publicar global apaga o ajuste pessoal da curadora no mesmo ticker.** Como
  o pessoal vence o global na hora de aplicar, deixar os dois faria a Beca
  publicar e continuar vendo o número velho — exatamente a confusão que o
  pedido dela descreve.
- **O pessoal continua vencendo o global.** A Beca dá o palpite, a usuária
  decide; o selo já separava os dois ("ajuste da Beca" × "teu ajuste"). Efeito:
  quem mexeu naquela empresa não recebe a atualização da Beca até clicar em
  "Voltar ao padrão".
- **`clearCeilingOverride` recebe escopo.** Apagar global usa `.is('user_id',
  null)` — no PostgREST `eq` com nulo não casa linha nenhuma.
- **`AppliedOverride.hasGlobal`** diz se existe ajuste da Beca naquele ticker
  mesmo quando o pessoal está vencendo. Serve só pro formulário da curadora
  saber se o botão é "Publicar" ou "Despublicar".
- **Verificado no banco (2026-08-10):** upsert com `user_id` nulo casa no
  índice `unique nulls not distinct` e atualiza em vez de duplicar; usuária
  comum lê o global, mas insert global e delete do global são barrados pela RLS.

## Voz do produto: de persona para ferramenta (2026-08-11)

A copy do sistema inteiro passou de "amiga que ensina" para voz de ferramenta.
Sem gíria, sem tratamento por "teu/tua", sem primeira pessoa, sem bordão. A
clareza continua sendo requisito — termo técnico aparece definido em uma frase
objetiva, não traduzido por analogia.

- **A Beca sai de dentro do produto e continua sendo a marca fora dele.** O
  chat virou "Assistente", `prompts/system.md` foi reescrito como assistente
  neutro, e `BecaTip`/`BecaAvatar` deixaram de existir. As regras inegociáveis
  do prompt não mudaram: nunca recomendar compra ou venda, nunca calcular
  número.
- **`InfoNote` substituiu `BecaTip`**: mesma informação, sem avatar e sem
  assinatura. A barra em ouro à esquerda é o que sobrou de marca — identifica
  sem personificar.
- **O ajuste global virou "ajuste da curadoria" na interface** — e **voltou a
  ser "ajuste da Beca" em 2026-08-12**, a pedido dela. Foi a única parte da
  despersonalização revertida: o selo diz de quem é o palpite, e "curadoria"
  não tem cara nem responsável. No banco e no código o papel continua sendo
  `is_curator`/`curator` (código em inglês).
- **`AppHeader.greeting` virou `title`.** A carteira não cumprimenta mais pelo
  nome, então o cálculo do primeiro nome saiu junto.

## Correções de segurança e de cálculo (2026-08-11)

Duas varreduras — uma de segurança no Supabase, outra técnica no código —
rodaram antes de a ferramenta receber usuárias de verdade. O que elas acharam
e o que foi feito:

- **Escalação de privilégio via `profiles` (migration 0013).** `is_curator`
  entrou numa tabela cuja policy de UPDATE libera a LINHA inteira, e o grant do
  Supabase cobre todas as colunas. Um `PATCH /rest/v1/profiles` direto — sem
  passar por Server Action — promovia qualquer conta a curadora, e a partir daí
  ela publicava preço teto para todas as usuárias. Corrigido com privilégio por
  coluna (`grant update (display_name, income_goal)`) mais trigger de defesa em
  profundidade. **A checagem na Server Action nunca protegeu isso**: quem
  protege coluna é o banco.
- **Injeção de prompt pelo `role: 'system'`.** O schema do `/api/chat` aceitava
  o papel `system` vindo do cliente, e o SDK o repassa como instrução de mesmo
  peso que o `prompts/system.md` — e depois dele. Qualquer conta logada podia
  desligar a regra de não recomendar compra e venda. Hoje o schema aceita só
  `user` e `assistant`.
- **`/api/chat` sem teto.** Sem limite por conta, sem `maxOutputTokens`, sem
  teto de tamanho de pergunta, e cada requisição remonta a carteira inteira
  mais o catálogo de preço teto. Agora são 40 perguntas por hora (contadas no
  próprio `chat_messages`, sem infra nova), 4.000 caracteres por pergunta e
  1.500 tokens de resposta.
- **`isAuthorizedCron` falhava em ABERTO.** Sem `CRON_SECRET`, as sete rotas de
  cron liberavam — e todas escrevem com service role. Hoje falha fechada em
  produção e continua aberta só em desenvolvimento. `CRON_SECRET` e
  `BOLSAI_API_KEY` entraram no `.env.example`.
- **O proxy virou portão.** A proteção morava só nas páginas, e todas
  acertavam — mas isso depende de lembrar. `src/lib/supabase/proxy.ts` agora
  redireciona quem não tem sessão, com allowlist de rotas públicas.
- **73% dos proventos caíam no mês errado.** `ex_date` é coluna `date`, e
  `new Date("2026-08-01")` é meia-noite UTC: convertido para São Paulo voltava
  para 31/07. Como a bolsai usa a competência mensal como data-com dos fundos,
  a maioria dos pagamentos cai no dia 1 e ia inteira para o mês anterior. Data
  pura agora é fatiada, nunca convertida. **Este é o mesmo defeito do eixo do
  gráfico de evolução**, corrigido junto.
- **O PostgREST corta em 1.000 linhas e o supabase-js não avisa.**
  `lib/supabase/paginate.ts` existe por isso. Duas consultas estavam sendo
  truncadas em silêncio: o histórico de proventos (ordenado por data-com
  ascendente, então o corte comia os pagamentos MAIS RECENTES, subestimando o
  total e zerando a renda estimada) e a proporção de JCP por ticker (1.000
  linhas cobriam 158 dos ~500 tickers, e o resto exibia o valor BRUTO rotulado
  como líquido).
- **O total recebido era bruto com o imposto explicado logo abaixo.** As duas
  frases não podiam ser verdade juntas. O relatório passou a ter `netReceived`,
  e é ele que aparece em destaque na carteira e em proventos.
- **O selo do CDI comparava DY bruto** enquanto o resto da tela usava líquido —
  numa ação 100% JCP, dizia "acima do CDI" quando o líquido estava abaixo.
- **O yield efetivo do FII dividia pelo valor digitado**, não pelo investido: o
  troco das cotas não compradas entrava no denominador.
- **Rendimento zerado na calculadora de renda passiva** anunciava patrimônio
  necessário de R$ 0,00 e meta atingida em 0 meses.
- **`NumberField` (novo) substituiu as quatro cópias do campo numérico.** O
  padrão `value={numero}` + `Number(e.target.value) || 0` zerava o campo em todo
  estado intermediário: digitar "9,43" resultava em "43". O texto agora vive em
  estado local e só vira número quando é finito.
- **`step="0.01"` no preço médio** barrava o submit em silêncio — mesma família
  do bug de `min`/`step` da meta de renda já documentado. Preço médio real tem
  mais casas (38,443333).
- **Sem teto de anos, os juros compostos imprimiam "R$ ∞"**. `formatBRL` ganhou
  guarda de valor não finito, e o campo, `max`.
- **O rótulo da média de Bazin dizia "(5a)" sempre.** 91 tickers têm 3 ou 4
  anos de histórico. `dividends_years` já existia no banco e nenhum componente
  lia.
- **Contagem de pagamentos inflava por lote:** duas compras de PETR4
  transformavam 8 pagamentos em 16. Agora conta eventos distintos.
- **`normalizePayment` não aplicava `sane()`** — e como `syncDividends` apaga
  antes de inserir, um único valor corrompido da bolsai (já houve 3,4e15)
  deixaria os tickers do bloco sem histórico nenhum.

### O que ficou pendente das varreduras

- **Rotacionar o `SUPABASE_ACCESS_TOKEN`**: ele está exportado no ambiente do
  shell, legível por qualquer processo local. É token de CONTA, não de projeto.
- ~~**`.mcp.json` está versionado com `read_only=false` e feature `account`.**~~
  Fechado em 2026-08-12: `read_only=true` e as features reduzidas a
  `docs,database,debugging,development`. Saíram `account` (administração da
  conta inteira, não só deste projeto), `branching` (cria e destrói branch de
  banco, e custa) e `functions` — o projeto nunca teve edge function nem
  branch, só as migrations em `supabase/migrations`. Aplicar migration passa a
  ser pelo SQL Editor ou pela CLI, que é onde já estava documentado.
  **Isso NÃO fecha o risco de verdade:** quem dá o poder é o
  `SUPABASE_ACCESS_TOKEN` no ambiente do shell, e ele continua sendo token de
  conta. A mudança limita o que ESTE servidor MCP pode fazer, não o que outro
  processo na máquina consegue com o mesmo token.
- **Proteção contra senha vazada** (HaveIBeenPwned) está desligada no Supabase.
  O mínimo do Zod subiu para 8 caracteres, mas a checagem é do painel.
- **`syncDividends` continua apagando antes de inserir**, sem transação. O
  `sane()` fecha o gatilho conhecido, não o desenho.
- **Snapshot e `getQuote` fazem fan-out sem limite de concorrência** — não dói
  com uma usuária, é o que aparece quando o tráfego chegar.
- **`/preco-teto` manda ~469 kB de JSON por pageview** (o dobro do que este
  arquivo registrava, porque a cobertura da sparkline cresceu). O corte barato é
  não enviar `priceHistory` das linhas fora da primeira página.
- A escala da bolsai **diverge entre `/fundamentals` e `/fundamentals/history`**
  no mesmo ticker (ESTR4): o `market_cap` que serve de régua vem diferente dos
  dois lados do corte. Hoje não produz selo errado porque a mediana do caso é
  negativa, mas o mecanismo está armado.

## Tema claro (2026-08-11)

Botão fixo no canto superior direito, em todas as telas. Na primeira visita o
tema **segue o aparelho**; a partir do primeiro clique, a escolha dela manda e
fica salva (`localStorage`, chave `cbi-theme`).

- **Nenhum componente mudou.** Foi o design system em 3 camadas que pagou por
  si: como não havia hex solto em componente, trocar o tema é redefinir a
  camada 2. As duas paletas moram inteiras no `:root`, com nomes honestos
  (`--cbi-black` continua preto, o claro tem `--cbi-paper-*`).
- **`light-dark()` em vez de media query duplicada:** `color-scheme: light dark`
  no `:root` faz o CSS seguir o aparelho sozinho, e `[data-theme]` trava um dos
  dois. Uma definição por token.
- **Mas `light-dark()` tem um limite medido no Chrome:** dentro de custom
  property herdada ele é resolvido UMA vez no `:root` e não recalcula quando só
  o `color-scheme` muda (testado: `color-scheme: light` no root com o valor já
  computado continua devolvendo preto; `light-dark()` direto no elemento
  funciona). Mudança de ATRIBUTO recalcula — por isso o `ThemeToggle` espelha a
  preferência do aparelho em `data-theme` e escuta `matchMedia`. Sem isso, quem
  troca o tema do celular com o app aberto ficaria na cor antiga (navegar pelo
  app não bastaria: o App Router não repinta o CSS).
- **O ouro do escuro NÃO sobrevive no claro:** `#D6A93C` sobre branco dá 1,9:1 —
  rótulo some, barra de gráfico some. No claro ele vira `#83600F` (5,4:1 sobre o
  papel). Isso vale pro `--primary` inteiro porque o token é fundo de botão E
  cor de texto: `text-primary` aparece em 79 lugares e `bg-primary` em 23 —
  separar os papéis seria mexer em 29 arquivos pra ganhar nada.
- **`--primary-fg` inverte junto:** preto sobre ouro claro (9,15:1) no escuro,
  branco sobre ouro escuro (5,76:1) no claro.
- **"deep" quer dizer MAIS FORTE, não mais escuro.** No preto o ouro forte
  clareia; no papel, escurece. Quem consome o token quer destaque.
- **Contraste do claro medido, não estimado** (mesma régua do escuro): 22 pares
  conferidos, nenhum texto abaixo de 4,5:1. Texto 16,8:1 sobre o papel; muted
  7,2:1; ouro 5,4:1; verde 5,1:1; coral 5,7:1.
- **Sombra virou variável de cor.** No escuro ela quase não aparece e a borda
  desenha o card; no claro ela volta a delimitar — mas preto puro suja o papel,
  daí o tom quente (`--shadow-tone`).
- **O ícone do botão é decidido em CSS** (`.theme-icon-to-*`), não em React: o
  servidor não tem como saber o tema do aparelho, e um ícone escolhido em JS
  piscaria o errado até a hidratação.
- **`suppressHydrationWarning` no `<html>`** é obrigatório: o script inline
  escreve `data-theme` antes do React, então o atributo SEMPRE difere do
  servidor.
- **Armadilha que custou o primeiro teste:** constante exportada de módulo
  `'use client'` **não chega ao servidor como valor**. `THEME_STORAGE_KEY` vivia
  no `theme-toggle.tsx`, e o script inline do layout saiu com
  `localStorage.getItem('function() { throw new Error("Attempted to call
  THEME_STORAGE_KEY() from the server…") }')` — procurando a mensagem de erro
  inteira como chave, sem erro no console. Por isso `lib/theme.ts` é um módulo
  neutro.
- **`meta[name=theme-color]`: o `media` atrapalha depois da escolha.** O Next
  emite duas (claro e escuro) e a hidratação reinsere uma terceira; sobrava uma
  escura casando com o aparelho e a barra do navegador ficava preta num app
  claro. `apply()` remove o `media` e iguala o `content` de todas, e reafirma a
  cada rota (a navegação client-side reinsere as metas).
- **`AppHeader` ganhou `pr-14`** pra reservar a faixa do botão fixo — sem isso
  ele cai em cima do "Sair" da carteira.

## A logo em arquivo (2026-08-11)

A Beca mandou a marca desenhada: hexágono em ouro com o monograma e a seta de
alta. Entrou no `BrandMark` (que já existia prevendo isso), nos ícones do PWA,
no favicon e numa faixa nova no topo de todas as telas.

- **A arte veio em JPEG com fundo preto chapado** — sem alfa, sem vetor. O
  recorte é por luminância (`scripts/build-brand-assets.mjs`): o desenho é ouro
  claro, o fundo é quase preto, então a luz do pixel vira o alfa. Os pixels de
  borda são **desmultiplicados** (cor ÷ alfa); sem isso a logo carrega um halo
  escuro pro tema claro.
- **`sharp` já vem com o Next** — foi o que permitiu fazer isso sem dependência
  nova. A máquina não tem ImageMagick nem Pillow, e o `sips` não faz alfa nem
  ICO.
- **Duas versões da marca, não uma.** O ouro da arte mede 1,43:1 sobre o papel
  do tema claro: some. A versão clara nasce em `modulate({ brightness: 0.55,
  saturation: 1.3 })` e fica com tom médio #856B0A, 4,82:1 sobre o papel —
  praticamente o `--cbi-gold-ink` do CSS. `linear` (multiplicar os canais) foi
  tentado antes e lava a cor junto: deu um marrom acinzentado de 4,17:1.
- **200px de altura, com paleta.** A marca aparece em 34px (faixa) e 56px
  (login e erro); em 512px o arquivo ia a 174 kB e era baixado em toda página.
  Hoje são 11 kB.
- **A faixa do topo existe porque logo fixa não cabia.** O botão de tema era
  `fixed` no canto; pôr a marca no canto oposto a jogaria em cima do `<h1>` de
  toda página no celular, onde o container tem 20px de respiro. A faixa resolve
  os dois — e o `pr-14` que o `AppHeader` tinha ganhado pôde sair.
- **Símbolo + nome, não só o símbolo.** Em 30px o monograma dentro do hexágono
  vira borrão e quem não conhece a marca não lê "CBI". O texto carrega o nome.
- **A faixa esconde a marca em login e cadastro** — essas telas já mostram a
  logo grande no meio; repetir no topo seria a mesma arte duas vezes na mesma
  dobra. O botão de tema fica.

## App instalável (PWA, 2026-08-07)

`src/app/manifest.ts` + ícones em `public/`. A usuária adiciona à tela de início
e abre em tela cheia, com ícone próprio — antes só dava pra abrir pela barra do
navegador, com a URL comendo uma faixa da tela.

- **Ícones são arquivo fixo em `public/`, não rota gerada.** O Next serve
  `app/icon.tsx` com hash na URL, e tanto o manifesto quanto o iOS querem
  caminho estável. A primeira leva saiu do `next/og` (Satori); desde a logo de
  2026-08-11 quem gera é `scripts/build-brand-assets.mjs`.
- **O `maskable` tem 20% de folga em volta.** O Android recorta o ícone em
  círculo, losango ou squircle dependendo do aparelho; sem a margem o "CBI"
  perde as pontas.
- **`favicon.ico` era o logo do Next.** Veio do scaffold e ninguém tinha trocado
  — a aba do navegador mostrava a marca errada. O atual é um ICO com PNG de
  256px dentro (o formato aceita desde o Vista), montado byte a byte no script
  porque não há ferramenta de imagem que monte ICO nesta máquina.
- **O iOS ignora o manifesto.** Quem manda ele abrir em tela cheia é
  `metadata.appleWebApp`. O Next emite só `mobile-web-app-capable`, que o iOS
  entende a partir do 16.4 — o `apple-mobile-web-app-capable` legado entra à mão
  em `metadata.other` pra iPhone mais velho.
- **NÃO existe service worker, de propósito.** O Chrome não exige mais um pra
  considerar o app instalável, e cache num app de investimento é ativamente
  perigoso: mostrar cotação velha achando que é a de agora é pior que não
  mostrar nada. Se um dia entrar, tem que ser só pro casco da interface, nunca
  pros dados.

## Notícias do mercado (2026-08-12)

Aba `/noticias`: manchetes de oito portais, com filtro "meus ativos" que casa a
matéria com os papéis da carteira. Referências que a Beca mandou: `arevista.com.br`,
`infomoney.com.br` e `bloomberglinea.com.br`.

- **Nenhuma das duas fontes pagas tem notícia.** A brapi v2 já era 404
  documentado; a bolsai também (`/news`, `/news/{ticker}`, `/market/news`,
  conferidos em 2026-08-12). Sobrou RSS — grátis, sem chave, sem limite.
- **Não vai pro banco, e não por preferência:** o Hobby dá 2 crons e os 2 estão
  ocupados (`market` e `snapshot`). Sem cron sobrando, ingerir notícia exigiria
  escrever na renderização. Fica em `fetch` com `next: { revalidate: 900 }` —
  mesma regra do preço, dado de fora vive no cache.
- **Parser de RSS escrito à mão, sem dependência nova.** É RSS 2.0 de
  WordPress mais o Arc da Bloomberg; regex resolve. `sharp` já tinha aberto
  esse precedente na logo.
- **A regra que decidiu a lista de fontes: feed de SEÇÃO sempre que existir.**
  A capa de um portal é o portal inteiro, e portal de economia publica loteria,
  vinho e casamento de jogador.
- **O caso que provou a regra foi a referência dela.** A capa da A Revista
  devolveu 10 de 10 itens sobre automóvel ("Honda WN7 tem 67 cv"), tudo na
  categoria "Mercados" — que lá é guarda-chuva de 2.841 posts. Pelas categorias
  reais (`/acoes`, `/fiis`, `/dividendos`, `/bolsa-hoje`) ela vira a **melhor
  fonte do conjunto**: 10/10, 10/10, 9/10 e 4/10 com ticker. Seu Dinheiro fez o
  mesmo caminho — `/empresas` dá 10/10 contra 5/10 da capa.
- **InfoMoney e E-Investidor não têm feed de seção que funcione:** as URLs de
  categoria respondem 200 com zero item e `?cat=…&feed=rss2` devolve a capa
  ignorando o filtro. Entram inteiros, podados por allowlist de seção.
- **Allowlist, não blocklist.** Com blocklist a aba abria com "Cristiano
  Ronaldo e Georgina se casam" e o E-Investidor entregava 3 loterias em 8
  itens: não dá pra enumerar tudo que um portal publica fora de economia, dá
  pra enumerar o que interessa. Custo assumido: cai "política" (o presidente do
  BC falando de precatórios) e "mundo" (Irã mexendo na projeção de petróleo).
- **A seção sai da primeira `<category>` OU do primeiro trecho da URL**, e
  basta uma casar — a Bloomberg não manda categoria nenhuma, e no E-Investidor
  a categoria de uma matéria é "Citibank" enquanto o caminho é "ultimas".
- **O filtro não é curadoria:** o InfoMoney carimbou uma matéria sobre o PCC
  como "Mercados" e ela passa. Limpa o óbvio, e só.
- **`[A-Z]{4}\d{1,2}` PERDE A B3SA3** — a própria bolsa tem dígito no meio do
  código. Dos 1.463 ativos listados, 368 não casam com a versão de quatro
  letras; fora BDR sobram B3SA3, B1003, as classes especiais da MRS e a EQMA3B.
  O padrão é `[A-Z][A-Z0-9]{3}\d{1,2}`, sempre conferido contra `companies` —
  casar o formato nunca basta, e é a conferência que impede código inventado de
  virar link pra página que não existe.
- **O texto que casa ticker é maior que o exibido** (leva as tags do item) e
  morre no servidor: `fetchMarketNews` recebe o catálogo e devolve os tickers
  já carimbados, em vez de mandar o texto extra dentro de cada card.
- **`Date.now()` no corpo de um Server Component é reprovado pelo
  `react-hooks/purity`.** O rótulo "há 2 h" nasce dentro de `lib/news.ts`, que
  não é componente — e de quebra a lista inteira usa um instante só.
- **Sem imagem, de propósito.** Os feeds trazem foto, mas cada portal serve de
  um host diferente: liberar todos em `remotePatterns` abriria o otimizador pra
  domínio de terceiro, e servir sem otimizar torraria a cota do Hobby.
- **O rodapé do WordPress vazava pro card.** Todo `description` termina em "The
  post {título} appeared first on {portal}", então o resumo repetia a manchete
  logo acima dele. `stripFeedBoilerplate` exige a frase inteira pra cortar —
  só "The post" derrubaria uma matéria que comece com essas palavras.
- **Dedupe por título normalizado**: matéria de agência sai igual em vários
  portais no mesmo minuto.
- Medido ao vivo em 2026-08-12: 122 coletadas → 13 cortadas por seção → **44%
  com ticker**, 46 kB de payload.

### O feed: 15 do dia, em colunas (referência: biblioteca de anúncios do Meta)

- **A tela mostra 15, não a lista inteira.** Feed curto é feed que se lê até o
  fim; o pool maior (`MAX_ITEMS`) continua existindo só pra sustentar o filtro
  por carteira.
- **"Vira todo dia": o corte é por DIA CIVIL de Brasília**, com piso. O pedido
  era "só as de hoje, o de ontem sai", e a medição mostrou por que não pode ser
  regra pura: em 2026-08-12 o dia corrente tinha 41 matérias, mas o sábado e o
  domingo anteriores tinham **2 cada** — bolsa fechada, portal não publica. Sem
  o piso a tela abriria vazia no fim de semana, que é quando sobra tempo pra
  ler. `selectDailyFeed` completa com as anteriores e a UI diz quantas são de
  hoje; card de outro dia troca "há 2 h" pela data.
- **`toDayKey` usa `en-CA` e `timeZone: America/Sao_Paulo`** — é o único locale
  que já imprime `AAAA-MM-DD`. Comparar dia por `toISOString` daria o dia em
  UTC, e depois das 21h em São Paulo o dia UTC já virou.
- **O filtro "meus ativos" olha 7 dias, o feed olha 1.** É filtro, não a mesma
  lista cortada: 13 das 41 matérias do dia citavam ALGUM papel, e o recorte da
  carteira dela é bem menor. Aba que abre vazia todo dia ensina a não clicar.
- **A grade é `columns` do CSS, não `grid`.** Com `grid` toda célula de uma
  linha assume a altura da mais alta, e manchete tem tamanho irregular — cada
  card curto abriria um buraco embaixo. `columns` deixa o card seguinte subir e
  encostar, que é o que a referência faz. Custo: a leitura desce uma coluna
  antes de ir pra próxima. Em quinze itens isso é leitura de jornal.
  `gap` não vale em coluna — o respiro é `mb-4` em cada card, com
  `break-inside-avoid` pra ninguém ser cortado na virada.
- **A faixa de topo com o portal é estrutura, não enfeite**: é o primeiro dado
  que decide se vale ler (o papel que a URL do anunciante tem na referência) e
  é a âncora visual que impede a coluna de virar parede de texto.
- **A foto é opcional em dois níveis.** Metade das fontes não manda nenhuma
  (A Revista, Suno e E-Investidor: 0 de 10; InfoMoney, Bloomberg e Valor: 10 de
  10), e parte das que manda aponta pra host que não serve —
  `s2-valorinveste.glbimg.com` devolve **NXDOMAIN**. É o layout de coluna que
  torna isso viável: altura já é livre, card sem foto não desalinha ninguém.
- **`onError` sozinho NÃO remove a imagem quebrada.** Medido: duas
  continuavam no DOM com `naturalWidth === 0`. A `<img>` vai no HTML do
  servidor e começa a carregar antes de o React hidratar; falhando nessa
  janela, o evento acontece sem ninguém escutando. `NewsImage` fecha isso com
  um ref que, na montagem, trata `complete && naturalWidth === 0` como falha.
- **`<img>` nativo, não `next/image`**: cada portal é um host diferente, e
  liberar todos em `remotePatterns` abriria o otimizador pra domínio de
  terceiro — além de queimar a cota do Hobby com foto de matéria.
  `referrerPolicy="no-referrer"` porque parte dos portais recusa requisição de
  fora.
- QA a 375, 820 e 1470px: 1, 2 e 3 colunas, `scrollWidth === clientWidth` nos
  três, zero imagem quebrada no DOM.

### A barra de navegação virou fixa (mesma leva)

- **No desktop ela era `static` e ia embora no scroll** — navegar exigia rolar
  até o fim da página. Hoje é `fixed` em toda largura: o `nav` é a faixa, e
  quem desenha a cápsula é o `ul`.
- **A cápsula tem `w-fit`, não `max-w-3xl`.** Com o sétimo destino o conteúdo
  passou dos 768px e vazava pra fora do arredondado — o "Chat" ficava do lado
  de fora e o item ativo estourava pela esquerda.
- **Os rótulos do desktop são curtos por requisito, não por estilo:** como a
  pílula cresce com o conteúdo, "Preço Teto" e "Calculadoras" empurravam a
  largura além da tela. "Teto" e "Contas" já eram as abreviações de antes.
- **`short` é o rótulo do celular**: a 375px sobram ~51px por item e
  "Carteira"/"Proventos" não cabem em uma linha — um rótulo quebrando desalinha
  a barra inteira. Conferido em iframe de 375px: sete rótulos em uma linha,
  `scrollWidth === clientWidth`.
- **A folga da barra mora no `<footer>` do layout**, não em cada página: o
  rodapé é o último elemento do documento em todas elas, e sem o `pb-28` o
  aviso educacional nascia embaixo da barra.

## Radar do Ibovespa (2026-08-13)

Aba `/radar`: onde o índice fechou dentro da própria faixa de 252 pregões, numa
régua de 0 a 100. Referência que a Beca mandou foi um HTML avulso chamado
"Radar de Sentimento", que serviu de briefing visual — a implementação é nova.

- **A conta é o Estocástico %K com janela de 252**, não um índice de sentimento.
  Fear & Greed mistura volatilidade, amplitude e put/call; aqui só entra preço.
  O nome da tela e o texto dizem "posição de preço" por isso.
- **`lib/market-radar.ts` é 100% função pura**, como `ceiling-price.ts`. Quem
  busca o dado é `lib/yahoo.ts`.
- **O gráfico só mostra pregão com janela CHEIA.** A referência calculava com
  janela crescente (`start = max(0, i − 252 + 1)`), o que mede o primeiro ano
  contra uma régua menor: um ponto com 40 pregões de histórico disputa a mínima
  com 40 candidatos, não com 252, e os dois trechos ficam lado a lado parecendo
  comparáveis. Buscar 2 anos e exibir 1 resolve sem nota de rodapé — dos 500
  pregões que o Yahoo devolve, 249 vão pra tela.
- **A fonte é o Yahoo (`^BVSP`), sem sufixo `.SA`** — o `^` já marca índice. A
  brapi não serve: `historical` do plano free para em `3mo` e a conta precisa de
  252 pregões. Medido em 2026-08-13: 500 pontos, zero nulo, 2 anos.
  **`curl` leva 429 nesse endpoint e o `fetch` do runtime volta 200** — é a
  mesma pegadinha de User-Agent já registrada, e vale pro UA do curl também.
- **O fallback de dado falso da referência foi removido, e era o problema mais
  grave dela.** Sem planilha configurada o HTML gerava um random walk calibrado
  pra cair em "Extrema Oportunidade" (`targetScore = 15 + Math.random()*8`):
  um app de investimento abrindo com sinal de compra inventado, atrás de um selo
  discreto de "demonstração". Aqui a fonte falha em `null` e a tela diz que o
  dado está indisponível.
- **As cores seguem a semântica do app: verde é alta, coral é queda** — o
  INVERSO da referência, que pintava a mínima de verde por ler fundo de faixa
  como oportunidade de compra. Duas razões: o produto não recomenda operação, e
  cor de aprovação sobre a mínima é recomendação sem texto; e verde já significa
  "subiu" em toda posição da carteira, então verde na mínima do ano ensinaria o
  oposto das outras telas. Estar no topo não é bom nem ruim — é ter subido.
- **Os rótulos das faixas descrevem posição, não ação:** "Fundo da faixa",
  "Parte baixa", "Centro da faixa", "Parte alta", "Topo da faixa". A referência
  usava "Extrema Oportunidade" e "💀 Risco Máximo", que são compra e venda
  escritas por extenso.
- **O número em destaque fica no `foreground`, não na cor da faixa.** A faixa do
  meio é `--muted-fg`, a mesma cor de texto secundário: o número principal da
  tela pintado nela lia como campo desabilitado. A cor vive no ponteiro, na
  legenda e na linha.
- **O SVG da linha não tem texto nenhum.** Com `preserveAspectRatio="none"` a
  caixa estica na horizontal e letra esticada fica torta — os rótulos são HTML
  em volta, como no gráfico de evolução. De quebra, sem recuo lateral a posição
  do cursor vira a fração exata do índice do ponto, e o hover não mede `rect`.
  O ponto e o balão também são HTML: dentro do SVG esticado o círculo viraria
  elipse.
- **O gauge é o oposto**: `preserveAspectRatio` padrão, porque meia-lua não pode
  esticar — e é por isso que os números do eixo podem viver dentro dele.
- **Pregões consecutivos da mesma faixa viram uma `polyline` só** (20 no dado de
  hoje, contra as 248 `<line>` que a referência desenhava). Cada segmento novo
  começa no ponto ANTERIOR à virada, senão a troca de cor abre um buraco.
- **A 375px as três legendas do eixo se encostavam** ("15/08/2025134.432"). A
  faixa desce pra própria linha no celular e volta pro meio a partir do `sm`.

## Pendências conhecidas

- **A aba de notícias não foi vista em aparelho real** — o QA foi Chrome
  desktop mais iframe de 375px, nos dois temas.
- **O radar também não foi visto em aparelho real** — mesmo QA: Chrome desktop
  a 1470px, iframe a 375, 690 e 768px, nos dois temas. Falta conferir o toque de
  verdade no gráfico: o scrub por `pointermove` funciona no mouse, e o
  `touch-pan-y` deixa o scroll vertical passar, mas isso não foi testado em
  tela sensível.
- **O radar tem uma fonte só, sem rede de segurança.** Se o Yahoo parar de
  responder o `^BVSP`, a tela inteira cai pro estado "dado indisponível" — não
  há segunda fonte, porque nem a brapi nem a bolsai servem 252 pregões de
  índice no plano contratado.
- **O casamento de ticker é só pelo CÓDIGO, nunca pelo nome da empresa.**
  Matéria que diz "Petrobras" sem escrever PETR4 não entra no filtro "meus
  ativos". Casar por nome exigiria derivar a marca da razão social da CVM
  ("PETROLEO BRASILEIRO S.A. PETROBRAS", "BCO BRADESCO S.A."), e o token mais
  longo dela é "BRASILEIRO" — que casaria com "mercado brasileiro". Falso
  positivo aqui é pior que ausência.
- **Nenhuma fonte de notícia tem contrato.** São feeds RSS públicos, e um
  portal pode fechar, mudar de caminho ou parar de responder sem aviso. A tela
  degrada (o feed some da rodada, os outros seguem), mas ninguém é avisado —
  não há alerta, só `console.error`.

- **O PWA instalado continua com casca escura no tema claro.** `manifest.ts`
  tem `theme_color`/`background_color` fixos (a splash) e o
  `appleWebApp.statusBarStyle` é `black-translucent`, lido só na instalação —
  nenhum dos dois acompanha a escolha da usuária. Quem instalar e usar no claro
  vê a splash preta e, no iPhone, texto claro na barra de status. Não foi
  testado em aparelho real.
- **Tema claro não foi visto em aparelho de verdade** — o QA foi Chrome
  desktop, com iframe de 375px pro mobile.
- **3 ações não têm fundamento na bolsai**: SMTO3, RAIZ4 e JALL3 devolvem 404
  com `"Insufficient data for calculation"`. As três são sucroenergéticas com
  exercício social fechando em março — provável causa. São 3 em 380.
- **DIVIDENDOS SÓ EXISTEM NO SANDBOX DA BRAPI (medido em 2026-08-04).**
  `/v2/stocks/dividends?symbols=PETR4` responde; o mesmo endpoint com ITSA4 dá
  `FEATURE_NOT_AVAILABLE`, e o módulo `dividends` do `/quote` foi removido do
  free até pros tickers de sandbox. `defaultKeyStatistics` idem: só sandbox.
  **Resolvido pela bolsai Pro** — a brapi hoje serve só catálogo e cotação.
- **Fiagro e FI-Infra ficaram de fora do catálogo.** A brapi separa `subType`
  em `fii` (294), `fi-agro` (35) e `fi-infra` (14), e só o primeiro entra. Os
  outros 49 pagam renda mensal e a bolsai cobre todos (o screener devolve 551
  fundos contra os 310 do nosso catálogo), mas entrariam rotulados "FII", que é
  nome errado. Decidir se vale uma etiqueta própria antes de incluir.
- **`syncCatalog` só faz upsert, nunca remove.** `companies` tem 1.418 linhas
  contra as 1.337 da última sincronização: são tickers que a brapi listou um dia
  e parou de listar. Ficam com preço velho, e o piso de liquidez não pega porque
  o volume antigo também ficou gravado. Limpar exige marcar "visto nesta rodada"
  — e cuidado, `ceiling_overrides` tem FK pra `companies`.
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

### QA de mobile (feito em 2026-08-06, a 375px)

A janela do Chrome não desce de 500px — pra testar 375 de verdade, carregar a
rota num `<iframe>` de 375px: media query resolve contra a largura dele.

Três coisas que só apareceram no celular:

- **A saudação estourava a tela na `/carteira`.** Sem nome cadastrado sobra o
  e-mail, e `split(' ')` não corta e-mail nenhum — "Oi,
  fulana.sobrenome@provedor.com!" empurrava a página pra 454px de largura. Hoje
  usa o que vem antes do @, e o `<h1>` tem `break-words` de rede.
- **O slider de payout tinha 8px de alvo.** A área de arraste de um
  `input[type=range]` é a caixa do input, não o traço desenhado: `h-2` deixava
  8px pro dedo na interação principal da tela. `h-6` triplica sem mudar o
  desenho.
- **"Editar" e "Remover" tinham 28px.** Pouco pra qualquer botão, ainda mais
  pra um destrutivo. Foram pra 36px.

- **Faltava `viewport-fit=cover`.** O Next declara o viewport padrão, mas sem
  essa peça `env(safe-area-inset-*)` devolve 0 — e a barra de navegação fixa
  ficava embaixo do home indicator do iPhone. O `padding-bottom` dela agora é
  `max(0.5rem, env(safe-area-inset-bottom))`, que não muda nada em aparelho sem
  entalhe.

O resto dos alvos fica entre 36 e 40px. Abaixo dos 44px que a diretriz pede,
mas subir tudo incharia a interface — se for mexer, medir antes.

**O que NÃO foi verificado:** aparelho real (iOS/Android de verdade), 3G,
leitor de tela e paisagem. O teste foi iframe em Chrome desktop.

**Peso do `/preco-teto`:** 690 ativos viram ~213 kB de dado antes do gzip. É o
preço de recalcular a tabela inteira no client quando a usuária mexe no slider.
Se virar problema em rede ruim, o corte é paginar do servidor — mas aí o slider
deixa de ser instantâneo.

## QA obrigatório antes de entregar

Responsivo mobile · loading states nas chamadas brapi · nenhuma chave secreta no bundle (`next build` + conferir) · disclaimer educacional em 3 lugares (rodapé, chat, página de ativo).

## Repositório e deploy

- **Código:** `github.com/pedraodemontao/cbi-beca` (branch `main`). O repositório
  antigo `beca-carteira` tem só o commit inicial e ficou como `origin-antigo` —
  não é mais o lugar do projeto.
- **Produção:** `centralcbi.site` (domínio próprio, em uso desde 2026-08-12);
  `beca-carteira.vercel.app` continua respondendo. O projeto na Vercel ainda se
  chama `beca-carteira` por dentro; só o produto virou Central CBI.
- **Produção e desenvolvimento apontam para o MESMO Supabase.** Não existe
  banco de teste: o que a `.env.local` acessa é o banco de verdade, com os
  dados de quem está usando o app. Antes de qualquer escrita fora da
  interface, lembrar disso.
- **Deploy sai de push na `main`.** Durante a construção os deploys foram por
  upload da CLI (`vercel deploy --prod`), o que deixou o repositório 17 commits
  atrás do que estava no ar. Com o Git conectado isso não acontece mais — mas se
  alguém rodar `vercel deploy` na mão, volta a acontecer.
- **Variável de ambiente nova não sobe com o código.** Precisa de
  `vercel env add NOME production` antes do deploy que depende dela.

## Comandos

- `npm run dev` / `npm run build` / `npm run lint`
- Migrations: aplicar os `supabase/migrations/*.sql` em ordem no SQL Editor do projeto Supabase (ou `supabase db push` se CLI vinculada).
- **Carga completa do zero, nesta ordem** (leva uns 2 minutos com a chave Pro):

  ```
  curl "localhost:3000/api/cron/catalog"                  # 1 req à brapi
  curl "localhost:3000/api/cron/fiis"                     # 2 reqs (screener)
  curl "localhost:3000/api/cron/fundamentals?limit=500"   # 2 reqs por ação
  curl "localhost:3000/api/cron/dividends?limit=700"      # 1 req por ativo
  curl "localhost:3000/api/cron/price-history?limit=300"  # Yahoo, mais lento
  ```

  O catálogo vem primeiro porque as outras leem os tickers que ele grava, e
  `fundamentals` antes de `dividends` porque a segunda também escreve em
  `company_fundamentals`. Rodar de novo é barato: quem tem balanço com menos de
  7 dias é pulado (`fundamentals_updated_at`).
- **Pra forçar re-sincronização de um ticker:** `update company_fundamentals set
  fundamentals_updated_at = null where ticker = 'XXXX'`. É o que tira ele do
  filtro de frescor.
