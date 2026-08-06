import { formatBRL } from '@/lib/format';
import type { SectorConcentration } from '@/lib/portfolio';

/**
 * Como a carteira se divide por setor.
 *
 * O tom aqui importa mais que o número: concentração não é erro, e quem está
 * começando com três ativos vai estar concentrada por definição. O card informa
 * e explica o porquê de olhar — não dá bronca nem manda diversificar.
 */

interface SectorConcentrationProps {
  concentration: SectorConcentration;
}

export function SectorConcentration({ concentration }: SectorConcentrationProps) {
  const { slices, dominant } = concentration;
  if (slices.length === 0) return null;

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Em que teu dinheiro está apostado
      </h2>
      <p className="micro-hint">
        Empresas do mesmo setor costumam subir e cair juntas. Saber onde teu
        dinheiro está concentrado é o primeiro passo — não é problema, é
        informação.
      </p>

      <ul className="mt-5 flex flex-col gap-4">
        {slices.map((slice) => (
          <li key={slice.sector}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-bold">{slice.sector}</p>
              <p className="num text-sm font-extrabold text-primary">
                {(slice.share * 100).toFixed(1).replace('.', ',')}%
              </p>
            </div>
            <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-panel">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(2, slice.share * 100)}%` }}
              />
            </div>
            <p className="micro-hint mt-1">
              {formatBRL(slice.value)} · {slice.tickers.join(', ')}
            </p>
          </li>
        ))}
      </ul>

      {dominant && (
        <p className="mt-5 rounded-panel bg-accent px-4 py-3 text-sm font-medium text-accent-text">
          <strong className="font-bold">
            {(dominant.share * 100).toFixed(0)}% da tua carteira está em{' '}
            {dominant.sector}.
          </strong>{' '}
          Isso quer dizer que, quando esse setor vai mal, boa parte do teu
          dinheiro sente junto. Não precisa mudar nada hoje — só vale lembrar
          disso no teu próximo aporte.
        </p>
      )}
    </section>
  );
}
