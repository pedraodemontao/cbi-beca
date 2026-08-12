'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NewsCard } from '@/components/noticias/news-card';
import type { NewsItemView } from '@/types/news';

interface NewsFeedProps {
  /** O feed do dia, já cortado no tamanho. */
  items: NewsItemView[];
  /** Matérias que citam papel da carteira, com janela maior. */
  mine: NewsItemView[];
  /** Tickers que a usuária tem em carteira. Vazio esconde o filtro. */
  myTickers: string[];
  /** Quantas do feed são do dia corrente. O resto vem carimbado com a data. */
  todayCount: number;
  /** `AAAA-MM-DD` de hoje em Brasília, pra decidir quem leva carimbo. */
  todayKey: string;
}

type Tab = 'today' | 'mine';

/**
 * A grade de notícias.
 *
 * Colunas de altura livre, como a biblioteca de anúncios do Meta — e é
 * `columns` do CSS, não `grid`. Com `grid` toda célula de uma linha assume a
 * altura da mais alta, o que num feed de manchetes de tamanhos diferentes
 * abriria buraco embaixo de cada card curto. Aqui o card seguinte sobe e
 * encosta no anterior.
 *
 * O efeito colateral do `columns` é a ordem: a leitura desce a primeira coluna
 * inteira antes de ir pra segunda, em vez de correr na horizontal. Pra uma
 * lista cronológica de quinze itens isso é a leitura de jornal, e é o que a
 * referência faz.
 *
 * O filtro roda no client porque a lista inteira já veio.
 */
export function NewsFeed({
  items,
  mine,
  myTickers,
  todayCount,
  todayKey,
}: NewsFeedProps) {
  const [tab, setTab] = useState<Tab>('today');

  const owned = useMemo(() => new Set(myTickers), [myTickers]);
  const hasPortfolio = myTickers.length > 0;
  const visible = tab === 'mine' ? mine : items;

  return (
    <div className="flex flex-col gap-4">
      {hasPortfolio && (
        <div role="tablist" aria-label="Filtro de notícias" className="flex gap-2">
          <TabButton
            isActive={tab === 'today'}
            onClick={() => setTab('today')}
            label="Do dia"
            count={items.length}
          />
          <TabButton
            isActive={tab === 'mine'}
            onClick={() => setTab('mine')}
            label="Meus ativos"
            count={mine.length}
          />
        </div>
      )}

      {tab === 'today' && todayCount < items.length && (
        <p className="micro-hint">
          {todayCount === 0
            ? 'Nenhum portal publicou hoje ainda — abaixo, as últimas matérias, com a data de cada uma.'
            : `${todayCount} ${todayCount === 1 ? 'matéria publicada hoje' : 'matérias publicadas hoje'}. As demais trazem a data.`}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="card text-sm font-medium text-muted-foreground">
          {tab === 'mine' ? (
            <>
              Nenhuma matéria dos últimos dias cita os ativos em carteira. O
              filtro depende do código do papel aparecer no texto — quando a
              matéria fala só do nome da empresa, ela continua na aba{' '}
              <button
                type="button"
                onClick={() => setTab('today')}
                className="font-bold text-primary underline"
              >
                Do dia
              </button>
              .
            </>
          ) : (
            <>
              Nenhum dos portais respondeu agora. A lista volta sozinha na
              próxima atualização.
            </>
          )}
        </p>
      ) : (
        // `gap-*` não vale em layout de colunas: o respiro entre cards é a
        // margem de cada um, e `break-inside-avoid` é o que impede um card de
        // ser cortado ao meio na virada da coluna.
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:balance]">
          {visible.map((item) => (
            <div key={item.id} className="mb-4 break-inside-avoid">
              <NewsCard
                item={item}
                owned={owned}
                showDate={item.publishedDay !== todayKey}
              />
            </div>
          ))}
        </div>
      )}

      {!hasPortfolio && (
        <p className="micro-hint">
          Com ativos cadastrados em{' '}
          <Link href="/carteira" className="font-bold underline">
            Carteira
          </Link>
          , esta tela ganha um filtro com as matérias que citam os papéis da
          carteira.
        </p>
      )}
    </div>
  );
}

interface TabButtonProps {
  isActive: boolean;
  onClick: () => void;
  label: string;
  count: number;
}

function TabButton({ isActive, onClick, label, count }: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'border border-border bg-panel text-muted-foreground hover:border-primary hover:text-primary'
      }`}
    >
      {label}
      <span className="num ml-1.5 opacity-70">{count}</span>
    </button>
  );
}
