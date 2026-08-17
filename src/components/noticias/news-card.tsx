import Link from 'next/link';
import { NewsImage } from '@/components/noticias/news-image';
import type { NewsItemView } from '@/types/news';

interface NewsCardProps {
  item: NewsItemView;
  /** Tickers da carteira — recebem destaque no meio dos demais citados. */
  owned?: ReadonlySet<string>;
  /** Marca a data quando o card não é do dia corrente. */
  showDate?: boolean;
}

/**
 * Card de notícia, no formato de coluna da biblioteca de anúncios do Meta:
 * faixa de identificação no topo, corpo de altura livre embaixo.
 *
 * A faixa carrega o portal porque é o primeiro dado que decide se vale ler —
 * o mesmo papel que a URL do anunciante tem na referência. Ela também é o que
 * dá ritmo à grade: com quinze cards de alturas diferentes, sem uma âncora
 * visual repetida no topo a coluna vira parede de texto.
 *
 * A foto é opcional e nunca estrutural. Metade das fontes não manda imagem
 * (A Revista, Suno e E-Investidor mandam zero) e parte das que mandam aponta
 * pra host que não serve — ver `NewsImage`. O card tem que ficar de pé sem
 * ela, e é o layout de coluna que permite isso: a altura já é livre, então um
 * card sem foto não abre buraco em ninguém.
 */
export function NewsCard({ item, owned, showDate }: NewsCardProps) {
  const isMine = item.tickers.some((ticker) => owned?.has(ticker));

  return (
    <article
      className={`overflow-hidden rounded-panel border bg-surface shadow-soft transition-colors hover:border-primary ${
        isMine ? 'border-primary/60' : 'border-border'
      }`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-panel px-3.5 py-2">
        <span className="truncate text-[0.7rem] font-extrabold uppercase tracking-[0.08em] text-primary">
          {item.source}
        </span>
        <time
          dateTime={item.publishedAt}
          title={item.publishedFull}
          className="shrink-0 text-[0.7rem] font-bold text-muted-foreground"
        >
          {showDate ? item.publishedFull.split(',')[0] : item.publishedLabel}
        </time>
      </header>

      {item.imageUrl && <NewsImage src={item.imageUrl} itemId={item.id} />}

      <div className="flex flex-col gap-2 p-3.5">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col gap-1.5"
        >
          <h3 className="text-[0.98rem] font-extrabold leading-snug tracking-tight hover:text-primary">
            {item.title}
          </h3>
          {item.summary && (
            <p className="line-clamp-4 text-[0.82rem] font-medium leading-relaxed text-muted-foreground">
              {item.summary}
            </p>
          )}
        </a>

        {/* Fora do <a> porque link dentro de link não é HTML válido — e o chip
            leva pra página do ativo, não pra matéria. */}
        {item.tickers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tickers.map((ticker) => (
              <Link
                key={ticker}
                href={`/ativo/${ticker}`}
                className={`num rounded-full px-2.5 py-1 text-[0.7rem] font-extrabold transition-colors ${
                  owned?.has(ticker)
                    ? 'bg-primary-surface text-primary-surface-foreground'
                    : 'bg-panel text-muted-foreground hover:text-primary'
                }`}
              >
                {ticker}
              </Link>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
