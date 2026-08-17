/**
 * Radar do Ibovespa — onde o índice fechou dentro da própria faixa de 12 meses.
 *
 * A conta é uma só: a distância entre a mínima e a máxima dos últimos 252
 * pregões vira uma régua de 0 a 100, e o fechamento do dia é um ponto nela.
 * 0 = fechou na mínima do período; 100 = fechou na máxima.
 *
 * Isso é POSIÇÃO DE PREÇO, não previsão e não avaliação: não entra lucro,
 * múltiplo nem fundamento. Serve pra situar o índice na própria história
 * recente. Os rótulos das faixas nomeiam essa posição em linguagem de
 * oportunidade (ver `RADAR_BANDS`), mas o número por trás continua sendo só o
 * fechamento medido contra a faixa — nenhum deles é ordem de compra ou venda.
 *
 * 100% função pura — sem rede e sem banco, como `ceiling-price.ts`. Quem busca
 * o dado é `lib/yahoo.ts`.
 */

/**
 * Um ano de bolsa. É a janela clássica de "faixa de 52 semanas", e o número de
 * pregões é o que importa aqui: contar dias corridos misturaria fim de semana e
 * feriado, que não têm fechamento.
 */
export const LOOKBACK_SESSIONS = 252;

/** Fechamento de um pregão. O dia é `AAAA-MM-DD`, já no fuso de Brasília. */
export interface DailyClose {
  day: string;
  close: number;
}

export interface RadarBand {
  key: string;
  /** Limite superior EXCLUSIVO da faixa, em 0-100. */
  max: number;
  label: string;
  /**
   * Ícone do rótulo. Vive separado do `label` porque o `label` também alimenta
   * o `aria-label` do gauge, e leitor de tela anunciando "fogo" antes do nome
   * da faixa atrapalha. Na tela ele entra como decoração (`aria-hidden`).
   */
  emoji: string;
  hint: string;
  /**
   * Token de cor, nunca hex: a tela tem tema claro e escuro, e um verde que
   * funciona sobre preto mede 2,1:1 sobre o papel.
   */
  color: string;
  range: string;
}

/**
 * A escala é de OPORTUNIDADE, e por isso corre ao contrário da semântica de
 * alta e queda do resto do app: verde no fundo da faixa, vermelho no topo.
 *
 * Isso foi decidido em 2026-08-13, seguindo a referência que originou a tela, e
 * REVERTE a direção anterior (rótulos que só descreviam posição — "Fundo da
 * faixa", "Topo da faixa" — pintados com verde = subiu). O custo é conhecido e
 * assumido: verde aqui significa "índice barato dentro da própria faixa",
 * enquanto verde em toda posição da carteira significa "subiu". As duas
 * leituras convivem no mesmo app.
 *
 * O que a inversão NÃO muda: o `hint` de cada faixa continua sendo o fato
 * medido, e não o juízo. É ele que ancora o rótulo no dado.
 *
 * As cinco faixas usam CINCO matizes, e isso é requisito e não estética. A
 * primeira versão gastava só três famílias — dois verdes, um cinza, dois
 * vermelhos —, e no arco do gauge os pares quase se fundiam: a legenda
 * prometia cinco degraus e o desenho entregava três blocos. Pior, o cinza do
 * meio era `--muted-fg`, a mesma cor de texto secundário, então a faixa mais
 * comum da tela vinha pintada de "desabilitado". Hoje a rampa progride em
 * matiz — 160° → 97° → 59° → 35° — com os dois passos do meio vindo dos
 * tokens de escala, que não são marca nem semântica de mercado.
 */
export const RADAR_BANDS: RadarBand[] = [
  {
    key: 'bottom',
    max: 20,
    label: 'Extrema Oportunidade',
    emoji: '🔥',
    range: '0–20%',
    color: 'var(--positive-deep)',
    hint: 'O índice fechou perto da mínima dos últimos 12 meses.',
  },
  {
    key: 'low',
    max: 40,
    label: 'Boa Oportunidade',
    emoji: '✅',
    range: '20–40%',
    color: 'var(--positive)',
    hint: 'Fechamento na metade inferior da faixa de 12 meses.',
  },
  {
    key: 'middle',
    max: 60,
    label: 'Condição Neutra',
    emoji: '⚖️',
    range: '40–60%',
    color: 'var(--scale-caution)',
    hint: 'Fechamento próximo ao meio da faixa de 12 meses.',
  },
  {
    key: 'high',
    max: 80,
    label: 'Momento de Cautela',
    emoji: '⚠️',
    range: '60–80%',
    color: 'var(--scale-warn)',
    hint: 'Fechamento na metade superior da faixa de 12 meses.',
  },
  {
    key: 'top',
    max: Infinity,
    label: 'Risco Máximo',
    emoji: '💀',
    range: '80–100%',
    color: 'var(--negative-deep)',
    hint: 'O índice fechou perto da máxima dos últimos 12 meses.',
  },
];

export function bandFor(position: number): RadarBand {
  return (
    RADAR_BANDS.find((band) => position < band.max) ??
    RADAR_BANDS[RADAR_BANDS.length - 1]
  );
}

export interface RadarPoint {
  day: string;
  close: number;
  /** Posição na faixa, de 0 a 100. */
  position: number;
}

export interface RadarReading {
  /** Só os pregões com janela COMPLETA — ver `computeRadar`. */
  points: RadarPoint[];
  current: RadarPoint;
  /** Mínima e máxima da janela do último pregão. */
  windowLow: number;
  windowHigh: number;
  /** Variação do índice nos últimos 5 pregões, em pontos percentuais. */
  changeFiveSessions: number | null;
}

/**
 * A leitura completa, ou `null` quando não há histórico suficiente.
 *
 * **O gráfico só mostra pregão com janela cheia.** A versão de referência
 * calculava com janela crescente (`start = max(0, i - 252 + 1)`), o que faz o
 * primeiro ano do gráfico ser medido contra uma régua menor que a dos demais:
 * um ponto com 40 pregões de histórico compete pela mínima com 40 candidatos,
 * não com 252. Os dois trechos ficam lado a lado parecendo comparáveis, e não
 * são. Buscar dois anos e exibir um resolve sem aviso de rodapé.
 */
export function computeRadar(history: DailyClose[]): RadarReading | null {
  const series = history.filter(
    (entry) => Number.isFinite(entry.close) && entry.close > 0
  );

  // Precisa da janela cheia mais um pregão: com um ponto só não há gráfico.
  if (series.length < LOOKBACK_SESSIONS + 1) return null;

  const points: RadarPoint[] = [];

  for (let index = LOOKBACK_SESSIONS - 1; index < series.length; index++) {
    const window = series.slice(index - LOOKBACK_SESSIONS + 1, index + 1);
    let low = Infinity;
    let high = -Infinity;
    for (const entry of window) {
      if (entry.close < low) low = entry.close;
      if (entry.close > high) high = entry.close;
    }

    const { day, close } = series[index];
    points.push({
      day,
      close,
      // Faixa achatada não existe em índice de bolsa, mas dividir por zero
      // devolveria NaN e pintaria a tela de traço.
      position: high === low ? 50 : ((close - low) / (high - low)) * 100,
    });
  }

  const current = points[points.length - 1];
  const window = series.slice(-LOOKBACK_SESSIONS);
  const closes = window.map((entry) => entry.close);

  const fiveAgo = series[series.length - 6];

  return {
    points,
    current,
    windowLow: Math.min(...closes),
    windowHigh: Math.max(...closes),
    changeFiveSessions: fiveAgo
      ? ((current.close - fiveAgo.close) / fiveAgo.close) * 100
      : null,
  };
}
