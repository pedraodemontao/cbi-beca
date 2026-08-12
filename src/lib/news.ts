import 'server-only';
import { fetchAllRows } from '@/lib/supabase/paginate';
import { listedSince } from '@/lib/ceiling-data';
import { formatDateTime, formatRelativeTime, toDayKey } from '@/lib/format';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { NewsItem, NewsItemView } from '@/types/news';

/**
 * Notícia de mercado, lida direto do RSS dos portais.
 *
 * Por que RSS e não uma API: nenhuma das duas fontes que o app já assina tem
 * notícia. A brapi v2 devolve 404 (documentado desde 2026-08-03) e a bolsai
 * também — `/news`, `/news/{ticker}` e `/market/news` conferidos em
 * 2026-08-12, todos 404. Sobra RSS, que é grátis, sem chave e sem limite de
 * requisição.
 *
 * Por que não vai pro banco: o plano Hobby da Vercel dá 2 crons por projeto e
 * os 2 já estão ocupados (`market` e `snapshot`). Sem cron sobrando, ingerir
 * notícia numa tabela exigiria escrever na renderização — pior que cachear o
 * `fetch`. É a mesma regra do preço: dado de fora vive no cache, não no banco.
 */

/** 15 minutos: notícia envelhece rápido, mas não a ponto de valer refetch por pageview. */
const REVALIDATE_SECONDS = 900;

/** Feed que não responde nesse prazo sai da rodada; os outros seguem. */
const FEED_TIMEOUT_MS = 8000;

interface NewsSource {
  /** Nome como aparece no selo do card. */
  name: string;
  url: string;
  /**
   * Quantos itens aproveitar. O Valor manda 100 por requisição, com o texto
   * inteiro da matéria em cada um — sem corte, ele sozinho afogaria os outros
   * cinco na ordenação por data.
   */
  limit: number;
  /**
   * Seções aceitas. Só para feed de portal inteiro; feed que já é de seção não
   * declara nada e passa direto.
   */
  sections?: string[];
}

/**
 * Onze feeds de oito portais. Os cinco primeiros cobrem as três referências
 * que a Beca mandou; o resto entra porque cita o CÓDIGO do papel, e é disso
 * que o filtro "meus ativos" vive.
 *
 * A regra que a medição de 2026-08-12 impôs: **feed de seção sempre que
 * existir**. O feed da capa de um portal é o portal inteiro, e portal de
 * economia publica loteria, vinho e resultado de futebol.
 *
 * O caso extremo foi a A Revista. A capa dela (`/feed/`) devolveu 10 de 10
 * itens sobre automóvel — "CFMOTO 450NK é confirmada no Brasil", "Honda WN7
 * tem 67 cv" —, tudo carimbado na categoria "Mercados", que lá é guarda-chuva
 * de 2.841 posts. Pelas categorias reais ela vira a MELHOR fonte do conjunto:
 *
 * | feed                     | itens | c/ ticker |
 * |--------------------------|-------|-----------|
 * | A Revista /acoes         |    10 |        10 |
 * | A Revista /fiis          |    10 |        10 |
 * | A Revista /dividendos    |    10 |         9 |
 * | A Revista /bolsa-hoje    |    10 |         4 |
 * | A Revista /feed (capa)   |    10 |         1 |  ← descartado
 * | Seu Dinheiro /empresas   |    10 |        10 |  (capa dava 5)
 * | Suno                     |    10 |         7 |
 * | Valor Investe /mercados  |   100 |        21 |
 * | Money Times /mercados    |    10 |         5 |
 * | E-Investidor             |     8 |         2 |
 * | InfoMoney                |    10 |         1 |
 * | Bloomberg Línea          |   100 |         0 |
 *
 * InfoMoney e E-Investidor não têm feed de seção que funcione — as URLs de
 * categoria respondem 200 com zero item, e `?cat=…&feed=rss2` devolve a capa
 * ignorando o filtro. Os dois entram inteiros e são podados por
 * `BLOCKED_SECTIONS`.
 *
 * InfoMoney e Bloomberg Línea rendem pouco ticker e ficam mesmo assim: são
 * referência dela, e são as duas que dão o contexto macro que os feeds de
 * ticker não dão.
 */
const SOURCES: NewsSource[] = [
  { name: 'A Revista', url: 'https://arevista.com.br/category/acoes/feed/', limit: 10 },
  { name: 'A Revista', url: 'https://arevista.com.br/category/fiis/feed/', limit: 10 },
  {
    name: 'A Revista',
    url: 'https://arevista.com.br/category/dividendos/feed/',
    limit: 10,
  },
  {
    name: 'A Revista',
    url: 'https://arevista.com.br/category/bolsa-hoje/feed/',
    limit: 10,
  },
  {
    name: 'InfoMoney',
    url: 'https://www.infomoney.com.br/feed/',
    limit: 20,
    sections: ['mercados', 'onde-investir', 'business', 'economia', 'negocios'],
  },
  {
    name: 'Bloomberg Línea',
    // O Arc (CMS da Bloomberg Línea) não serve `/feed/` nem `/rss/` — os dois
    // devolvem 404. O feed real fica nesta rota interna do publicador.
    url: 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml',
    limit: 20,
    sections: [
      'mercados',
      'negocios',
      'agro',
      'startups',
      'tech',
      'internacional',
      'brasil',
    ],
  },
  { name: 'Money Times', url: 'https://www.moneytimes.com.br/mercados/feed/', limit: 15 },
  { name: 'Suno', url: 'https://www.suno.com.br/noticias/feed/', limit: 15 },
  { name: 'Seu Dinheiro', url: 'https://www.seudinheiro.com/empresas/feed/', limit: 15 },
  {
    name: 'E-Investidor',
    url: 'https://einvestidor.estadao.com.br/feed/',
    limit: 15,
    sections: ['investimentos', 'mercado', 'mercados', 'ultimas', 'bolsa-de-valores'],
  },
  {
    name: 'Valor Investe',
    url: 'https://valorinveste.globo.com/rss/valorinveste/mercados/',
    limit: 25,
  },
];

/**
 * Teto do que sai da leitura dos feeds. Não é o que aparece na tela — a tela
 * mostra `DAILY_FEED_SIZE`. O resto sustenta o filtro "meus ativos", que
 * precisa de janela maior pra ter o que mostrar.
 */
const MAX_ITEMS = 90;

/** Quantos cards a tela mostra. Feed curto é feed que se lê inteiro. */
const DAILY_FEED_SIZE = 15;

/**
 * Janela do filtro por carteira, em dias.
 *
 * Maior que a do feed principal de propósito: matéria citando um ticker
 * específico é rara — 13 das 41 matérias do dia citavam ALGUM papel, e o
 * recorte da carteira dela é bem menor que isso. Cortar o filtro no dia
 * corrente deixaria a aba vazia quase sempre, e uma aba que nunca tem nada
 * ensina a não clicar nela.
 */
export const MINE_WINDOW_DAYS = 7;

const SUMMARY_LENGTH = 240;

/**
 * Ticker da B3: letra, mais três de letra-ou-dígito, mais um ou dois dígitos.
 *
 * O padrão óbvio seria `[A-Z]{4}\d{1,2}`, e ele **perde a B3SA3** — a própria
 * bolsa tem dígito no meio do código. Conferido contra o catálogo: dos 1.463
 * ativos listados, 368 não casam com a versão de quatro letras, e entre os que
 * não são BDR sobram B3SA3, B1003, as classes especiais da MRS e a EQMA3B.
 * Só a B3SA3 aparece em manchete com frequência, e é o suficiente pra valer a
 * troca.
 *
 * Sensível a maiúscula de propósito — é o que separa "PETR4" de palavra
 * comum. O `\b` final derruba fracionário (`PETR4F`) sem regra à parte: o `F`
 * grudado quebra a borda.
 *
 * Casar o formato nunca basta. Todo candidato é conferido contra `companies`,
 * e é isso que impede um código inventado de virar link pra uma página que não
 * existe.
 */
const TICKER_PATTERN = /\b[A-Z][A-Z0-9]{3}\d{1,2}\b/g;

/**
 * Lê os seis feeds e devolve a lista pronta, já com os tickers carimbados.
 *
 * O catálogo entra aqui, e não num passo depois, porque o texto usado pra
 * casar ticker é maior que o texto exibido — leva as tags do item, onde
 * InfoMoney e Money Times marcam o papel com mais frequência que no título.
 * Casando aqui dentro, esse texto extra morre no servidor em vez de viajar
 * pro client dentro de cada card.
 */
export async function fetchMarketNews(
  known: ReadonlySet<string>
): Promise<NewsItemView[]> {
  const batches = await Promise.all(SOURCES.map(fetchSource));

  const items = batches.flat();
  items.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  // O rótulo de tempo nasce aqui, e não na página, por dois motivos: um único
  // instante de referência pra lista inteira, e `Date.now()` dentro do corpo
  // de um Server Component é impureza — o `react-hooks/purity` reprova.
  const now = Date.now();

  return dedupeByTitle(items)
    .slice(0, MAX_ITEMS)
    .map(({ matchText, ...item }) => ({
      ...item,
      tickers: findTickers(matchText, known),
      publishedLabel: formatRelativeTime(item.publishedAt, now),
      publishedFull: formatDateTime(item.publishedAt),
      publishedDay: toDayKey(item.publishedAt),
    }));
}

/**
 * As matérias do dia, completando com as anteriores até fechar `size`.
 *
 * O pedido era "só as de hoje, o de ontem sai". A medição mostrou por que isso
 * não pode ser regra pura: em 2026-08-12 o dia corrente tinha 41 matérias, mas
 * o sábado e o domingo anteriores tinham **2 cada** — a bolsa não abre e os
 * portais não publicam. Sem o piso, a tela abriria vazia no fim de semana, que
 * é justamente quando sobra tempo pra ler.
 *
 * Por isso o corte é por quantidade e não por data: o dia manda enquanto tem
 * material, e o resto entra carimbado com a data pra ninguém confundir matéria
 * de sexta com notícia de hoje.
 */
export function selectDailyFeed(
  items: NewsItemView[],
  size = DAILY_FEED_SIZE
): { items: NewsItemView[]; today: number; todayKey: string } {
  // O "agora" nasce aqui e não na página: `Date.now()` no corpo de um Server
  // Component é impureza, e o `react-hooks/purity` reprova.
  const todayKey = toDayKey(Date.now());
  const today = items.filter((item) => item.publishedDay === todayKey);

  if (today.length >= size) {
    return { items: today.slice(0, size), today: size, todayKey };
  }

  const older = items.filter((item) => item.publishedDay !== todayKey);
  return {
    items: [...today, ...older.slice(0, size - today.length)],
    today: today.length,
    todayKey,
  };
}

/** As matérias da janela do filtro que citam algum papel da carteira. */
export function selectPortfolioNews(
  items: NewsItemView[],
  owned: ReadonlySet<string>,
  days = MINE_WINDOW_DAYS
): NewsItemView[] {
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  return items.filter(
    (item) =>
      Date.parse(item.publishedAt) >= since &&
      item.tickers.some((ticker) => owned.has(ticker))
  );
}

/**
 * As matérias que citam UM ticker, pra página do ativo.
 *
 * Não busca o catálogo: o único código que interessa já veio no argumento, e é
 * ele mesmo que serve de régua. Os feeds são os mesmos e o cache também, então
 * abrir a página de um ativo não custa requisição nova.
 */
export async function fetchAssetNews(
  ticker: string,
  limit = 5
): Promise<NewsItemView[]> {
  const items = await fetchMarketNews(new Set([ticker]));
  return items.filter((item) => item.tickers.length > 0).slice(0, limit);
}

/**
 * Casa só contra título, tags e o começo do resumo. O corpo inteiro da matéria
 * fica de fora de propósito: um "a Petrobras também subiu" no décimo parágrafo
 * marcaria PETR4 numa matéria que não é sobre ela.
 */
function findTickers(text: string, known: ReadonlySet<string>): string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(TICKER_PATTERN)) {
    if (known.has(match[0])) found.add(match[0]);
  }

  return [...found].sort();
}

/** Tickers que a brapi ainda lista — a régua que valida o que o regex pescou. */
export async function fetchKnownTickers(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const rows = await fetchAllRows<{ ticker: string }>((from, to) =>
    supabase
      .from('companies')
      .select('ticker')
      .gte('last_seen_at', listedSince())
      .range(from, to)
  );

  return new Set(rows.map((row) => row.ticker));
}

/** Só existe dentro deste módulo: `matchText` nunca chega ao client. */
interface RawNewsItem extends NewsItem {
  matchText: string;
}

async function fetchSource(source: NewsSource): Promise<RawNewsItem[]> {
  try {
    const response = await fetch(source.url, {
      next: { revalidate: REVALIDATE_SECONDS },
      // Custa a memoização por render (documentada no `fetch` do Next), que
      // aqui não faz falta: cada feed é lido uma vez só por página.
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`Feed ${source.name} respondeu ${response.status}`);
      return [];
    }

    return parseFeed(await response.text(), source);
  } catch (error) {
    // Portal fora do ar não pode derrubar a tela — os outros cinco seguem.
    console.error(`Falha ao ler o feed ${source.name}`, error);
    return [];
  }
}

function parseFeed(xml: string, source: NewsSource): RawNewsItem[] {
  const items: RawNewsItem[] = [];

  for (const block of xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/g) ?? []) {
    const title = clean(tagContent(block, 'title'));
    const url = clean(tagContent(block, 'link'));
    const published = parseDate(tagContent(block, 'pubDate'));

    // Sem data não há como ordenar, e a lista inteira existe pra ser
    // cronológica. Sem link não há pra onde mandar a leitora.
    if (!title || !url || !published) continue;
    if (!isAllowedSection(block, url, source.sections)) continue;

    // O Valor manda subtítulo curto e `description` com a matéria inteira; o
    // subtítulo é melhor resumo e vem primeiro quando existe.
    const lead =
      clean(stripHtml(tagContent(block, 'atom:subtitle'))) ||
      stripFeedBoilerplate(clean(stripHtml(tagContent(block, 'description'))));
    const summary = truncate(lead, SUMMARY_LENGTH);

    items.push({
      id: url,
      title,
      url,
      source: source.name,
      publishedAt: published,
      summary,
      tickers: [],
      imageUrl: extractImage(block),
      matchText: `${title} ${categories(block)} ${summary}`,
    });

    if (items.length >= source.limit) break;
  }

  return items;
}

/**
 * Filtro de seção — só para feed de portal inteiro.
 *
 * É allowlist, não blocklist, e a medição de 2026-08-12 é que decidiu: com
 * blocklist a capa do InfoMoney abria a aba de mercado com o casamento do
 * Cristiano Ronaldo, e o E-Investidor entregava 3 resultados de loteria em 8
 * itens. Não dá pra enumerar tudo que um portal de economia publica fora de
 * economia; dá pra enumerar o que interessa.
 *
 * Custa notícia legítima de seção não listada — "política" trazia o presidente
 * do Banco Central e "mundo" trazia o Irã mexendo na projeção de petróleo, e
 * as duas caem. É o preço de não abrir com celebridade, e Valor e Money Times
 * cobrem macro por outro caminho.
 *
 * A seção sai da primeira `<category>` (no WordPress é a principal) OU do
 * primeiro trecho do caminho da URL — a Bloomberg Línea não manda categoria
 * nenhuma, e as duas nem sempre concordam: no E-Investidor a categoria de uma
 * matéria é "Citibank" e o caminho é "ultimas". Basta uma das duas casar.
 *
 * Não pega tudo: o InfoMoney carimbou "Lula e Alcolumbre" como Mercados.
 * Filtro de seção limpa o óbvio, não substitui curadoria.
 */
function isAllowedSection(
  block: string,
  url: string,
  sections: string[] | undefined
): boolean {
  if (!sections) return true;

  const allowed = new Set(sections);

  const first = block.match(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/);
  if (first && allowed.has(slug(clean(stripCdata(first[1]))))) return true;

  try {
    const [segment] = new URL(url).pathname.split('/').filter(Boolean);
    return segment ? allowed.has(slug(segment)) : false;
  } catch {
    return false;
  }
}

/**
 * O acento vira nada, não vira separador: sem remover a marca combinante,
 * "Política" viraria `poli-tica` e nunca casaria com a lista.
 */
function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * A foto da matéria, se o feed mandar alguma.
 *
 * Três formatos, nesta ordem: `media:content`/`media:thumbnail` (Valor e
 * Bloomberg), `enclosure` (padrão do RSS 2.0, que ninguém aqui usa mas custa
 * uma linha) e o primeiro `<img>` de dentro do `description` (InfoMoney).
 *
 * Medido em 2026-08-12: InfoMoney, Bloomberg e Valor mandam em 10 de 10;
 * A Revista, Suno e E-Investidor mandam em 0. Metade do feed sai sem foto, e é
 * por isso que ela é enfeite e não estrutura — o card tem que ficar de pé sem.
 */
function extractImage(block: string): string | undefined {
  const media = block.match(
    /<media:(?:content|thumbnail)[^>]*\burl="([^"]+)"/i
  );
  if (media) return decodeEntities(media[1]);

  const enclosure = block.match(
    /<enclosure[^>]*\burl="([^"]+)"[^>]*\btype="image\//i
  );
  if (enclosure) return decodeEntities(enclosure[1]);

  const inline = stripCdata(tagContent(block, 'description')).match(
    /<img[^>]*\bsrc="([^"]+)"/i
  );
  return inline ? decodeEntities(inline[1]) : undefined;
}

/**
 * Tira o rodapé que o WordPress cola no fim de todo `description`:
 * "The post {título} appeared first on {portal}." Sem isso o resumo do card
 * repete a manchete que está logo acima dele, e o corte de 240 caracteres
 * termina no meio da repetição.
 *
 * O corte exige a frase inteira — só "The post" não basta, senão uma matéria
 * que comece com essas palavras perderia o texto todo.
 */
function stripFeedBoilerplate(value: string): string {
  return value
    .replace(/\s*The post\b[\s\S]*?appeared first on[\s\S]*$/i, '')
    .replace(/\s*O post\b[\s\S]*?apareceu primeiro em[\s\S]*$/i, '')
    .trim();
}

function categories(block: string): string {
  return (block.match(/<category(?:\s[^>]*)?>[\s\S]*?<\/category>/g) ?? [])
    .map((tag) => clean(stripCdata(inner(tag))))
    .join(' ');
}

function tagContent(block: string, tag: string): string {
  // O `<` obrigatório na frente do nome impede que `<title>` case dentro de
  // `<media:title>`: ali o que existe é `title>`, sem o sinal de abertura.
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i')
  );
  return match ? stripCdata(match[1]) : '';
}

function inner(tag: string): string {
  return tag.replace(/^<[^>]*>/, '').replace(/<\/[^>]*>$/, '');
}

/**
 * O Valor abre CDATA pra imagem, fecha, e continua com o texto solto no mesmo
 * `description`. Por isso os marcadores são removidos em vez de o conteúdo ser
 * extraído de dentro deles.
 */
function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '');
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  ndash: '–',
  mdash: '—',
  laquo: '«',
  raquo: '»',
};

function clean(value: string): string {
  return decodeEntities(value).replace(/\s+/g, ' ').trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => {
      const decoded = NAMED_ENTITIES[name.toLowerCase()];
      return decoded ?? whole;
    });
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * `pubDate` é RFC 822 com fuso explícito ("Wed, 12 Aug 2026 15:22:32 +0000"),
 * então converter é o certo aqui — o oposto da regra das colunas `date` do
 * banco, que são data pura e por isso nunca passam por `new Date`.
 */
function parseDate(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Matéria de agência sai igual em vários portais no mesmo minuto — o Estadão
 * Conteúdo aparece no InfoMoney e no Money Times ao mesmo tempo. Como a lista
 * já vem ordenada por data, quem fica é a publicação mais recente.
 */
function dedupeByTitle(items: RawNewsItem[]): RawNewsItem[] {
  const seen = new Set<string>();
  const unique: RawNewsItem[] = [];

  for (const item of items) {
    const key = item.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}
