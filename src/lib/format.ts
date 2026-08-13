const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const percentFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
});

const ratioFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const signedRatioFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

const quantityFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 8,
});

/**
 * Um valor não finito na tela é sempre defeito de cálculo, e o `Intl` imprime
 * "R$ ∞" ou "R$ NaN" sem reclamar. O traço deixa claro que o dado falta, em vez
 * de exibir um símbolo que ninguém entende.
 */
export function formatBRL(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return brlFormatter.format(value);
}

/** Recebe percentual já em escala 0-100 (como a brapi devolve). */
export function formatPercent(value: number): string {
  return percentFormatter.format(value / 100);
}

/** Recebe razão em escala 0-1, como as contas de preço teto devolvem. */
export function formatRatio(value: number): string {
  return ratioFormatter.format(value);
}

/** Razão 0-1 com sinal — pra margem, onde o "+" e o "−" são a informação. */
export function formatRatioSigned(value: number): string {
  return signedRatioFormatter.format(value);
}

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}

const indexPointsFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

/**
 * Índice em pontos — o Ibovespa não é dinheiro, e imprimir "R$ 166.745" faria a
 * usuária achar que aquilo é o preço de alguma coisa.
 */
export function formatIndexPoints(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return indexPointsFormatter.format(value);
}

/** `AAAA-MM-DD` puro em `dd/mm/aaaa`, sem passar por fuso. */
export function formatPlainDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (!year || !month || !date) return '—';
  return `${date}/${month}/${year}`;
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'short',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * `AAAA-MM-DD` do instante, no fuso de Brasília.
 *
 * O `en-CA` é o atalho: é o único locale do `Intl` que já imprime nessa ordem,
 * o que evita remontar a data a partir das partes. Serve pra comparar dias sem
 * passar por `toISOString`, que devolveria o dia em UTC — e depois das 21h em
 * São Paulo o dia UTC já virou.
 */
export function toDayKey(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return dayKeyFormatter.format(date);
}

/** Data e hora completas, no fuso de Brasília. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return dateTimeFormatter.format(date);
}

/**
 * "há 2 h", "há 3 d" — para lista de notícia, onde o que importa é a idade da
 * matéria, não o carimbo exato.
 *
 * Recebe o instante de referência em vez de chamar `Date.now()` porque quem
 * calcula é o servidor: se o client recalculasse na hidratação, o texto
 * divergiria do que veio no HTML.
 */
export function formatRelativeTime(iso: string, now: number): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const minutes = Math.round((now - date.getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;

  const days = Math.round(hours / 24);
  if (days < 7) return `há ${days} d`;

  return formatDateTime(iso).split(',')[0];
}
