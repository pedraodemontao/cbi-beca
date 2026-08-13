import Link from 'next/link';
import { AssetLogo } from '@/components/shared/asset-logo';
import {
  formatBRL,
  formatMultiple,
  formatRatio,
  formatRatioSigned,
} from '@/lib/format';
import { extremeIndex, type ComparisonRow } from '@/lib/comparison';

interface ComparisonTableProps {
  rows: ComparisonRow[];
}

/**
 * A tabela lado a lado.
 *
 * **Não existe "melhor" aqui, e a ausência é deliberada.** A referência que
 * originou a tela pintava de verde a melhor célula de cada linha e coroava um
 * vencedor. Duas coisas quebram nisso: a plataforma não recomenda compra nem
 * venda, e "maior rendimento" não é "melhor ativo" — o próprio app exclui do
 * ranking de proventos quem pagou mais de 15% em 12 meses, porque na maioria
 * das vezes aquilo é devolução de capital, não renda.
 *
 * O que ficou é o extremo MARCADO E NOMEADO: a célula do maior rendimento diz
 * "maior", não "melhor". "Maior" é fato verificável; "melhor" é conselho.
 */
export function ComparisonTable({ rows }: ComparisonTableProps) {
  const margins = rows.map((row) => row.margin);
  const yields = rows.map((row) => row.netYield);
  const priceToBooks = rows.map((row) => row.priceToBook);

  const widestMargin = extremeIndex(margins, 'max');
  const highestYield = extremeIndex(yields, 'max');
  const lowestPriceToBook = extremeIndex(priceToBooks, 'min');

  const hasOutlier = rows.some((row) => row.isOutlier);

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">Lado a lado</h2>
      <p className="micro-hint">
        Os mesmos números que a tabela de preço teto usa, para os ativos
        escolhidos. O selo marca o maior ou o menor valor da linha — é
        constatação, não indicação de compra.
      </p>

      {/* Conteúdo largo rola no próprio container: com quatro colunas de
          números a tabela não cabe a 375px, e deixar a PÁGINA rolar na
          horizontal quebraria todas as outras seções junto.

          A largura mínima ACOMPANHA o número de colunas em vez de ser fixa. Com
          um piso fixo de 34rem, comparar dois ativos num celular já obrigava a
          rolar de lado pra ver a segunda coluna — e uma comparação em que só um
          dos lados aparece não compara nada. Com dois ativos, que é o caso
          comum, agora cabe inteira a 375px; com três ou quatro rola, o que é
          inevitável e fica evidente pela barra. */}
      <div className="mt-4 overflow-x-auto">
        <table
          className="num w-full border-collapse text-sm"
          style={{ minWidth: `${4.5 + rows.length * 5}rem` }}
        >
          <caption className="sr-only">
            Comparação de {rows.map((row) => row.ticker).join(', ')}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-24 pb-3 pr-2 text-left align-bottom sm:w-36 sm:pr-3">
                <span className="micro-label">Métrica</span>
              </th>
              {rows.map((row) => (
                <th
                  key={row.ticker}
                  scope="col"
                  className="px-2 pb-3 text-right align-bottom sm:px-3"
                >
                  <Link
                    href={`/ativo/${row.ticker}`}
                    className="flex flex-col items-end gap-1.5 font-extrabold transition-colors hover:text-primary"
                  >
                    <AssetLogo ticker={row.ticker} url={row.logoUrl} size={28} />
                    <span className="text-base">{row.ticker}</span>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row
              label="Categoria"
              cells={rows.map((row) =>
                row.assetType === 'fii' ? (row.fundType ?? 'Fundo') : 'Ação'
              )}
            />
            <Row
              label="Cotação"
              cells={rows.map((row) => formatBRL(row.price ?? NaN))}
            />
            <Row
              label="Preço teto"
              cells={rows.map((row) =>
                row.ceiling === null ? '—' : formatBRL(row.ceiling)
              )}
              note={rows.map((row) =>
                row.overrideSource === 'curator'
                  ? 'ajuste da Beca'
                  : row.overrideSource === 'personal'
                    ? 'teu ajuste'
                    : null
              )}
            />
            <Row
              label="Margem de segurança"
              cells={rows.map((row) =>
                row.margin === null ? '—' : formatRatioSigned(row.margin)
              )}
              markIndex={widestMargin}
              markLabel="maior"
            />
            <Row
              label="Rendimento 12 m"
              cells={rows.map((row) =>
                row.netYield === null ? '—' : formatRatio(row.netYield)
              )}
              note={rows.map((row) =>
                row.jcpShare > 0 ? `${Math.round(row.jcpShare * 100)}% em JCP` : null
              )}
              markIndex={highestYield}
              markLabel="maior"
            />
            <Row
              label="P/VP"
              cells={rows.map((row) => formatMultiple(row.priceToBook))}
              markIndex={lowestPriceToBook}
              markLabel="menor"
            />
          </tbody>
        </table>
      </div>

      <p className="micro-hint mt-4">
        O rendimento é o LÍQUIDO: a parte paga como JCP chega com 15% de imposto
        retido na fonte, e por isso duas ações com o mesmo anúncio podem
        depositar valores diferentes. Rendimento de fundo é isento.
      </p>

      {hasOutlier && (
        <p className="mt-3 rounded-panel bg-negative-tint px-4 py-3 text-sm font-semibold text-negative-deep">
          Um dos ativos tem provento ou lucro fora do padrão da própria história
          — costuma ser evento único, como venda de imóvel ou devolução de
          capital, e não se repete no ano seguinte.
        </p>
      )}
    </section>
  );
}

interface RowProps {
  label: string;
  cells: string[];
  /** Texto pequeno abaixo do valor, por coluna. */
  note?: (string | null)[];
  /** Coluna que leva o selo de extremo; -1 quando há empate ou dado de menos. */
  markIndex?: number;
  markLabel?: string;
}

function Row({ label, cells, note, markIndex = -1, markLabel }: RowProps) {
  return (
    <tr className="border-t border-border">
      <th scope="row" className="py-3 pr-2 text-left align-top sm:pr-3">
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
      </th>
      {cells.map((cell, index) => (
        <td key={index} className="px-2 py-3 text-right align-top sm:px-3">
          <span className="block font-bold">{cell}</span>
          {/* Selo e nota vão ABAIXO do número, não ao lado. Inline, o chip
              "maior" somava ~55px à coluna e era ele — não os valores — que
              impedia duas colunas de caberem lado a lado num celular. */}
          {index === markIndex && markLabel && (
            <span className="mt-1 inline-block whitespace-nowrap rounded-full bg-primary-wash px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-primary-deep">
              {markLabel}
            </span>
          )}
          {note?.[index] && (
            <span className="block pt-0.5 text-[0.7rem] font-semibold text-muted-foreground">
              {note[index]}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}
