import type { AssetType } from '@/types/portfolio';

/**
 * Como cada tipo de ativo se chama na tela.
 *
 * Mora fora dos componentes porque três lugares diziam a mesma coisa por
 * conta própria — o selo do card, a composição do resumo e o contexto que vai
 * pro chat. Enquanto eram dois tipos isso era barato; com BDR entrando, um
 * deles ia ficar pra trás e a mesma posição apareceria como "BDR" na carteira
 * e "Ação" na resposta da assistente.
 *
 * `Record<AssetType, …>` de propósito: acrescentar valor ao enum sem
 * acrescentar rótulo passa a ser erro de compilação, não texto faltando.
 */
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  stock: 'Ação',
  fii: 'FII',
  bdr: 'BDR',
  etf: 'ETF',
};

/** Nome por extenso, pra legenda e gráfico onde cabe a palavra inteira. */
export const ASSET_TYPE_LABEL_LONG: Record<AssetType, string> = {
  stock: 'Ações',
  fii: 'Fundos imobiliários',
  bdr: 'BDRs (empresas de fora)',
  etf: 'ETFs (fundos de índice)',
};

/**
 * As classes que aparecem na composição da carteira.
 *
 * É `AssetType` mais renda fixa, que não é `AssetType` porque não mora em
 * `positions` — tem tabela própria, sem ticker nem quantidade.
 */
export type AllocationClass = AssetType | 'fixed_income';

export const ALLOCATION_LABEL: Record<AllocationClass, string> = {
  ...ASSET_TYPE_LABEL_LONG,
  fixed_income: 'Renda fixa',
};

/**
 * Rampa categórica, definida no `globals.css`. Cor aqui não significa alta,
 * queda nem marca — significa só "esta é outra categoria". Ver o bloco
 * `--cat-*` para o porquê de ter deixado de emprestar token de mercado.
 */
export const ALLOCATION_COLOR: Record<AllocationClass, string> = {
  stock: 'bg-cat-1',
  fii: 'bg-cat-2',
  bdr: 'bg-cat-3',
  etf: 'bg-cat-4',
  fixed_income: 'bg-cat-5',
};

/** A unidade em que o provento é anunciado: "R$ 1,20 por ___". */
export const ASSET_TYPE_UNIT: Record<AssetType, string> = {
  stock: 'ação',
  fii: 'cota',
  bdr: 'BDR',
  etf: 'cota',
};
