import Link from 'next/link';
import { NewsCard } from '@/components/noticias/news-card';
import type { NewsItemView } from '@/types/news';

interface AssetNewsProps {
  ticker: string;
  items: NewsItemView[];
}

/**
 * Notícias que citam este ativo.
 *
 * Some quando não há nada: manchete é dado esparso — a maioria dos papéis
 * passa dias sem aparecer nos portais —, e um bloco vazio fixo na página
 * ensinaria a leitora a ignorar essa faixa da tela justamente nos dias em que
 * ela tem conteúdo.
 */
export function AssetNews({ ticker, items }: AssetNewsProps) {
  if (items.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">
          Notícias sobre {ticker}
        </h2>
        <Link
          href="/noticias"
          className="text-sm font-bold text-primary underline"
        >
          Ver tudo
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id}>
            <NewsCard item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
