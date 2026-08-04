import Link from 'next/link';
import { formatBRL, formatRatio } from '@/lib/format';
import type { TopPayer } from '@/lib/ceiling-data';

/**
 * Quem mais paga dividendo na bolsa hoje.
 *
 * Ordena pelo rendimento sobre o preço, não pelo valor em reais: R$ 1,00 numa
 * ação de R$ 10,00 vale muito mais que R$ 1,00 numa de R$ 100,00, e é essa
 * comparação que a lista precisa ensinar.
 */

interface DividendRankingProps {
  stocks: TopPayer[];
  fiis: TopPayer[];
  /** Quantos saíram por rendimento extraordinário. */
  excluded: number;
}

export function DividendRanking({ stocks, fiis, excluded }: DividendRankingProps) {
  if (stocks.length === 0 && fiis.length === 0) return null;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Quem mais paga na bolsa hoje
      </h2>
      <p className="micro-hint">
        O que cada um distribuiu nos últimos 12 meses comparado ao preço da
        ação. Só entra quem negocia de verdade — papel parado engana.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <RankingList title="Ações" rows={stocks} />
        <RankingList title="Fundos imobiliários" rows={fiis} />
      </div>

      <p className="mt-5 border-t border-border pt-4 text-xs font-medium text-muted-foreground">
        {excluded > 0 && (
          <>
            Tirei {excluded} ativo{excluded === 1 ? '' : 's'} que{' '}
            {excluded === 1 ? 'pagou' : 'pagaram'} mais de 15% do próprio preço
            no ano: isso quase sempre é venda de imóvel,
            devolução de capital ou dividendo extraordinário — dinheiro que cai
            uma vez e não volta.{' '}
          </>
        )}
        Mesmo aqui, rendimento passado não se repete por decreto. É ponto de
        partida pra pesquisa, não recomendação.
      </p>
    </section>
  );
}

function RankingList({ title, rows }: { title: string; rows: TopPayer[] }) {
  if (rows.length === 0) return null;

  return (
    <div>
      <h3 className="micro-label">{title}</h3>
      <ol className="mt-2 flex flex-col">
        {rows.map((row, index) => (
          <li
            key={row.ticker}
            className="flex items-center gap-3 border-b border-border/70 py-2.5 last:border-0"
          >
            <span className="num w-5 flex-none text-sm font-bold text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <Link
                href={`/ativo/${row.ticker}`}
                className="font-extrabold text-primary-deep hover:underline"
              >
                {row.ticker}
              </Link>
              <p className="num text-xs font-medium text-muted-foreground">
                {formatBRL(row.dividends12m)} por {row.assetType === 'fii' ? 'cota' : 'ação'} ·
                custa {formatBRL(row.price)}
              </p>
            </div>
            <span
              className={`chip ${row.isOutlier ? 'bg-accent text-accent-foreground' : 'chip-up'}`}
              title={
                row.isOutlier
                  ? 'Rendimento muito acima do normal — costuma ser venda de ativo ou devolução de capital, que não se repete.'
                  : undefined
              }
            >
              {formatRatio(row.dividendYield)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
