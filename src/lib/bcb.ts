import 'server-only';

// API pública do Banco Central (SGS) — sem chave, sem plano.
// https://api.bcb.gov.br/dados/serie/bcdata.sgs.{serie}/dados
const BASE_URL = 'https://api.bcb.gov.br/dados/serie';

const SERIES = {
  cdi: 12, // CDI diário (% ao dia)
  selic: 11, // Selic diária (% ao dia)
  ipca: 433, // IPCA mensal (% ao mês)
} as const;

const REVALIDATE_SECONDS = 21600; // 6h — séries só mudam uma vez por dia

interface SgsPoint {
  data: string; // dd/MM/yyyy
  valor: string;
}

function toBrDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

async function fetchSeries(
  series: number,
  from: Date,
  to: Date
): Promise<SgsPoint[] | null> {
  const url = `${BASE_URL}/bcdata.sgs.${series}/dados?formato=json&dataInicial=${toBrDate(from)}&dataFinal=${toBrDate(to)}`;
  try {
    const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!res.ok) {
      console.error(`BCB série ${series} respondeu ${res.status}`);
      return null;
    }
    return (await res.json()) as SgsPoint[];
  } catch (error) {
    console.error(`BCB série ${series} falhou`, error);
    return null;
  }
}

/**
 * Rendimento acumulado do CDI no período, em %. As taxas diárias do SGS são
 * compostas (não somadas): cada dia rende sobre o acumulado do anterior.
 */
export async function getAccumulatedCdi(
  from: Date,
  to: Date = new Date()
): Promise<number | null> {
  if (from >= to) return 0;

  const points = await fetchSeries(SERIES.cdi, from, to);
  if (!points || points.length === 0) return null;

  const factor = points.reduce((acc, point) => {
    const daily = Number(point.valor);
    return Number.isFinite(daily) ? acc * (1 + daily / 100) : acc;
  }, 1);

  return (factor - 1) * 100;
}

/** Um dia da série do CDI, com a data já em `AAAA-MM-DD`. */
export interface CdiPoint {
  day: string;
  daily: number;
}

/**
 * A série crua do CDI, para quem precisa avaliar MUITOS períodos diferentes.
 *
 * `getCdiAccrual` faz uma requisição por intervalo, o que é certo numa tela
 * (poucas posições, e o `revalidate` de 6h cobre). No cron de snapshot seriam
 * ~100 chamadas ao Banco Central numa rodada, uma por posição de cada
 * usuária. Aqui a série vem inteira uma vez e cada período é fatiado em
 * memória por `accrueBetween`.
 */
export async function getCdiSeries(
  from: Date,
  to: Date = new Date()
): Promise<CdiPoint[] | null> {
  const points = await fetchSeries(SERIES.cdi, from, to);
  if (!points) return null;

  return points
    .map((point) => {
      // O SGS devolve `dd/MM/yyyy`; vira `AAAA-MM-DD` pra comparar como texto,
      // sem passar por `new Date` e sem risco de fuso.
      const [d, m, y] = point.data.split('/');
      return { day: `${y}-${m}-${d}`, daily: Number(point.valor) };
    })
    .filter((point) => Number.isFinite(point.daily));
}

/** Fatia a série num intervalo e compõe, com o percentual aplicado por dia. */
export function accrueBetween(
  points: CdiPoint[],
  fromDay: string,
  toDay: string,
  percentOfCdi = 100
): CdiAccrual {
  const multiplier = percentOfCdi / 100;
  let factor = 1;
  let businessDays = 0;

  for (const point of points) {
    if (point.day < fromDay || point.day > toDay) continue;
    businessDays += 1;
    factor *= 1 + (point.daily / 100) * multiplier;
  }

  return { factor, businessDays };
}

export interface CdiAccrual {
  /** Fator multiplicativo do período: 1,0842 significa 8,42% acumulados. */
  factor: number;
  /**
   * Pregões no intervalo. Vem de graça: a série 12 do SGS publica um ponto por
   * DIA ÚTIL, então contar os pontos já exclui fim de semana e feriado
   * bancário sem precisar de calendário da B3. É o que o prefixado usa no
   * expoente `dias/252`.
   */
  businessDays: number;
}

/**
 * Rendimento de um papel atrelado ao CDI, como fator.
 *
 * O `percentOfCdi` é aplicado a CADA TAXA DIÁRIA antes de compor, e não ao
 * acumulado depois:
 *
 *   certo:  Π(1 + d × 1,10)
 *   errado: 1 + (Π(1 + d) − 1) × 1,10
 *
 * Medido com a diária de 0,052531% e 252 pregões: 15,6703% contra 15,5650%,
 * ou 0,105 ponto percentual em um ano — e a diferença cresce com o prazo,
 * porque é juro sobre juro que deixa de existir.
 *
 * Papel prefixado também chama esta função, com `percentOfCdi = 0`: aí o
 * fator sai 1 e o que interessa é o `businessDays`.
 */
export async function getCdiAccrual(
  from: Date,
  to: Date = new Date(),
  percentOfCdi = 100
): Promise<CdiAccrual | null> {
  if (from >= to) return { factor: 1, businessDays: 0 };

  const points = await fetchSeries(SERIES.cdi, from, to);
  if (!points) return null;

  const multiplier = percentOfCdi / 100;
  let factor = 1;
  let businessDays = 0;

  for (const point of points) {
    const daily = Number(point.valor);
    if (!Number.isFinite(daily)) continue;
    businessDays += 1;
    factor *= 1 + (daily / 100) * multiplier;
  }

  return { factor, businessDays };
}

/** CDI anualizado a partir da última taxa diária publicada (252 dias úteis). */
export async function getCurrentCdiYearly(): Promise<number | null> {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 10);

  const points = await fetchSeries(SERIES.cdi, from, to);
  const last = points?.at(-1);
  if (!last) return null;

  const daily = Number(last.valor);
  if (!Number.isFinite(daily)) return null;

  return ((1 + daily / 100) ** 252 - 1) * 100;
}
