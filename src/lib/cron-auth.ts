import 'server-only';

/**
 * O cron da Vercel chega com `Authorization: Bearer $CRON_SECRET`.
 *
 * Falha FECHADA em produção: sem `CRON_SECRET` a rota nega, em vez de liberar.
 * A versão anterior devolvia `true` quando o segredo não existia — o que
 * funciona enquanto a variável está lá, mas transforma qualquer descuido de
 * ambiente (renomear a variável, subir um preview novo, criar outro projeto na
 * Vercel) em sete rotas abertas que escrevem com service role: `market-sync`
 * reescreve o catálogo inteiro e `snapshot` grava a carteira de todas as
 * contas. O modo de falha é que estava errado, não a checagem.
 *
 * Em desenvolvimento o segredo continua opcional, senão rodar a carga local
 * exigiria configurar variável só pra isso.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    const isProduction =
      process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    return !isProduction;
  }

  return request.headers.get('authorization') === `Bearer ${secret}`;
}
