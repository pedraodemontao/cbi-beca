import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getIbovHistory } from '@/lib/yahoo';
import {
  LOOKBACK_SESSIONS,
  RADAR_BANDS,
  bandFor,
  computeRadar,
} from '@/lib/market-radar';
import { formatIndexPoints, formatPlainDay, formatPercent } from '@/lib/format';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { RadarChart } from '@/components/radar/radar-chart';
import { RadarGauge } from '@/components/radar/radar-gauge';

export const metadata = {
  title: 'Radar do Ibovespa',
};

export default async function RadarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const history = await getIbovHistory();
  const reading = history ? computeRadar(history) : null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Radar do Ibovespa
          </h1>
          <p className="micro-hint">
            Onde o índice fechou dentro da própria faixa dos últimos{' '}
            {LOOKBACK_SESSIONS} pregões. É leitura de posição de preço: não
            entra lucro, múltiplo nem fundamento, e não há projeção do que vem
            depois.
          </p>
        </header>

        {!reading ? (
          <section className="card-lg">
            <h2 className="text-lg font-extrabold tracking-tight">
              Dado indisponível
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              A cotação histórica do Ibovespa não respondeu agora. A tela volta
              a exibir o radar assim que a fonte responder — nada é estimado
              enquanto isso.
            </p>
          </section>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr] lg:items-start">
              <section className="card-lg">
                <h2 className="text-lg font-extrabold tracking-tight">
                  Ibovespa nos últimos 12 meses
                </h2>
                <p className="micro-hint">
                  A linha muda de cor conforme a posição do fechamento na faixa.
                  Toque ou passe o cursor para ver o valor de cada pregão.
                </p>
                <div className="mt-4">
                  <RadarChart points={reading.points} />
                </div>
              </section>

              <section className="card-lg">
                <h2 className="text-lg font-extrabold tracking-tight">
                  Posição de hoje
                </h2>
                <div className="mt-2">
                  <RadarGauge position={reading.current.position} />
                </div>
                <CurrentReading reading={reading} />
              </section>
            </div>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {RADAR_BANDS.map((band) => {
                const isActive =
                  bandFor(reading.current.position).key === band.key;
                return (
                  <div
                    key={band.key}
                    className={`rounded-panel border border-l-4 bg-surface px-4 py-3 ${
                      isActive ? 'border-border shadow-soft' : 'border-border/60'
                    }`}
                    style={{ borderLeftColor: band.color }}
                  >
                    <span className="num text-xs font-bold text-muted-foreground">
                      {band.range}
                    </span>
                    <p className="text-sm font-extrabold">{band.label}</p>
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {band.hint}
                    </p>
                  </div>
                );
              })}
            </section>

            <section className="card-lg">
              <h2 className="text-lg font-extrabold tracking-tight">
                Como o número é calculado
              </h2>
              <p className="mt-2 text-sm font-medium text-muted-foreground">
                A mínima e a máxima dos últimos {LOOKBACK_SESSIONS} pregões
                formam uma régua de 0 a 100, e o fechamento do dia é um ponto
                nela: 0 significa fechar na mínima do período, 100 na máxima.
              </p>
              <p className="num mt-3 rounded-panel bg-panel px-4 py-3 text-sm font-semibold text-foreground">
                ({formatIndexPoints(reading.current.close)} −{' '}
                {formatIndexPoints(reading.windowLow)}) ÷ (
                {formatIndexPoints(reading.windowHigh)} −{' '}
                {formatIndexPoints(reading.windowLow)}) ={' '}
                {reading.current.position.toFixed(1)}%
              </p>
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                O gráfico exibe apenas pregões cuja janela de{' '}
                {LOOKBACK_SESSIONS} dias está completa. Um ponto medido contra
                uma janela menor disputaria a mínima com menos candidatos e
                apareceria na tela como se fosse comparável aos demais.
              </p>
            </section>

            <InfoNote title="Aviso">
              A posição na faixa descreve o que já aconteceu com o preço e não
              antecipa o que vem depois. Índice perto da mínima ou da máxima não
              é indicação de compra nem de venda: a plataforma não recomenda
              operações.
            </InfoNote>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}

function CurrentReading({
  reading,
}: {
  reading: NonNullable<ReturnType<typeof computeRadar>>;
}) {
  const band = bandFor(reading.current.position);
  const change = reading.changeFiveSessions;

  return (
    <div className="mt-1 text-center">
      {/* O número em destaque fica no `foreground`, não na cor da faixa. A
          faixa do meio é cinza — a mesma cor de texto secundário —, e o número
          principal da tela pintado nela lia como campo desabilitado. Quem
          carrega a cor é o ponteiro, a legenda e a linha do gráfico. */}
      <p className="num text-4xl font-extrabold tracking-tight">
        {reading.current.position.toFixed(1)}%
      </p>
      <p className="text-base font-extrabold">{band.label}</p>
      <p className="micro-hint mt-1">{band.hint}</p>

      <dl className="num mt-4 flex flex-col gap-2 rounded-panel bg-panel px-4 py-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-muted-foreground">Fechamento</dt>
          <dd className="font-bold">
            {formatIndexPoints(reading.current.close)} pts
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-muted-foreground">Faixa de 12 m</dt>
          <dd className="font-bold">
            {formatIndexPoints(reading.windowLow)} –{' '}
            {formatIndexPoints(reading.windowHigh)}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="font-medium text-muted-foreground">5 pregões</dt>
          <dd
            className={`font-bold ${
              change == null
                ? 'text-muted-foreground'
                : change >= 0
                  ? 'text-positive-deep'
                  : 'text-negative-deep'
            }`}
          >
            {change == null
              ? '—'
              : `${change >= 0 ? '+' : ''}${formatPercent(change)}`}
          </dd>
        </div>
      </dl>

      <p className="micro-hint mt-3">
        Fechamento de {formatPlainDay(reading.current.day)}.
      </p>
    </div>
  );
}
