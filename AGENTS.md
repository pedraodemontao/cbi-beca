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

### Etapas do Preço Teto

1. ✅ Migrations 0003, `lib/bolsai.ts`, `lib/ceiling-price.ts`, `lib/market-sync.ts`, crons
2. `/preco-teto` — tabela do print (Projetado)
3. Payout e lucro manual salvando por usuária
4. Abas Bazin · Graham · Gordon
5. FII (sem LPA: dividendo 12m ÷ yield) + JCP no payout + flag de outlier
6. Sparkline 30 dias + ranking de dividendos
7. Preço Teto vira a home

## Pendências conhecidas

- **Migration 0003 (preço teto) precisa ser aplicada no Supabase.**
- **bolsai ainda no plano free (200 req/dia)** — cobre ~150 ações por execução.
  Com o Pro (R$ 49/mês) o `?limit=` da sincronização pode subir pra 400+.
- **`/dividends`, `/financials` e `/screener` da bolsai não foram testados** —
  dão 403 no free. Validar quando a chave virar Pro (bloqueia a etapa do Bazin).
- **Confirmação de e-mail está LIGADA no Supabase** — signup não devolve sessão até o usuário confirmar. Desligar em Authentication → Sign In/Up → Email para agilizar o desenvolvimento.
- **Usuário de teste criado em 2026-08-03:** `qa.carteira.teste@gmail.com` (não confirmado). Apagar em Authentication → Users quando quiser.
- Chat não persiste histórico entre recarregamentos (não estava no escopo).
- Nada commitado além do scaffold inicial.
- **Migration 0002 (snapshots) precisa ser aplicada no Supabase** antes do gráfico de evolução funcionar.
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
- Popular o preço teto localmente: `curl "localhost:3000/api/cron/catalog"` e depois `curl "localhost:3000/api/cron/fundamentals?limit=150"` (o `limit` respeita a cota diária do plano free da bolsai).
