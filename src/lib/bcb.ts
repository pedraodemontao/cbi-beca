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
