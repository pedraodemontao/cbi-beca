import 'server-only';

/**
 * Lê TODAS as linhas de uma consulta, em blocos.
 *
 * O PostgREST corta em 1.000 linhas por padrão (`db-max-rows`) e o supabase-js
 * NÃO avisa: a consulta volta com sucesso, só que incompleta. Isso já estava
 * mordendo em dois lugares —
 *
 * - o histórico de proventos da carteira, ordenado por data-com ASCENDENTE, o
 *   que fazia o corte comer justamente os pagamentos MAIS RECENTES: total
 *   recebido subestimado e renda mensal estimada tendendo a zero (são ~33
 *   pagamentos por ticker, então basta uma carteira com ~30 ativos);
 * - a proporção de JCP por ticker, onde as 1.000 linhas cobriam 158 dos ~500
 *   tickers e o resto ficava com `jcpShare: 0`, exibindo o valor BRUTO
 *   rotulado como líquido.
 *
 * Recebe uma função que monta a página em vez do builder pronto: o tipo
 * genérico do `PostgrestFilterBuilder` não sobrevive a ser passado adiante, e
 * `(from, to) => query.range(from, to)` resolve sem `any`.
 *
 * Falha parcial devolve o que já veio, com o erro no console: melhor uma tela
 * incompleta que uma tela vazia.
 */
const PAGE_SIZE = 1000;

/** Teto de segurança: 50 mil linhas é muito além de qualquer consulta real. */
const MAX_PAGES = 50;

interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const rows: T[] = [];

  for (let index = 0; index < MAX_PAGES; index++) {
    const from = index * PAGE_SIZE;
    const { data, error } = await page(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('Falha ao paginar consulta', error);
      return rows;
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }

  console.error(`Consulta excedeu ${MAX_PAGES} páginas — resultado truncado.`);
  return rows;
}
