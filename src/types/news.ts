/** Notícia já normalizada, pronta pra tela. */
export interface NewsItem {
  /** Estável entre renderizações: a URL da matéria. */
  id: string;
  title: string;
  url: string;
  /** Nome do portal, do jeito que aparece no selo do card. */
  source: string;
  /** ISO completo, com fuso — RSS entrega RFC 822, não data pura. */
  publishedAt: string;
  /** Primeiras linhas da matéria, sem HTML. Vazio quando o feed não manda. */
  summary: string;
  /** Tickers do catálogo citados na matéria. Ordenados alfabeticamente. */
  tickers: string[];
  /**
   * Foto da matéria, quando o feed manda. Metade das fontes não manda — o
   * layout em colunas tolera isso porque a altura do card já é variável.
   */
  imageUrl?: string;
}

/** O que o componente de lista recebe: notícia + rótulo de tempo já resolvido. */
export interface NewsItemView extends NewsItem {
  /** "há 2 h", "há 3 d" — calculado no servidor, pra não divergir na hidratação. */
  publishedLabel: string;
  /** Data completa, pro `title` do elemento. */
  publishedFull: string;
  /** `AAAA-MM-DD` no fuso de Brasília. É por ele que a lista do dia é cortada. */
  publishedDay: string;
}
