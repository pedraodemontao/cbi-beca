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

export function formatQuantity(value: number): string {
  return quantityFormatter.format(value);
}
