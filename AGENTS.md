<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# beca-carteira

Ferramenta web de acompanhamento de carteira de investimentos (ações B3 + FIIs) com chat de IA na persona da Beca Alcântara. Sem Open Finance — usuário cadastra posições manualmente.

## Stack

Next.js 16 (App Router, TypeScript, `src/`), Tailwind v4, Supabase (Auth + Postgres + RLS), brapi.dev (dados de mercado), Anthropic (chat). Deploy: Vercel.

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
- **Chaves:** anon key do Supabase é pública por design (RLS protege). `SUPABASE_SERVICE_ROLE_KEY`, `BRAPI_TOKEN`, `ANTHROPIC_API_KEY` só server-side.
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

## Pendências conhecidas

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
- Migration: aplicar `supabase/migrations/0001_init.sql` no SQL Editor do projeto Supabase (ou `supabase db push` se CLI vinculada).
