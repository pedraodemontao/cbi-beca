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

export function formatBRL(value: number): string {
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
