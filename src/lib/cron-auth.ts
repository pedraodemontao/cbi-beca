import 'server-only';

/**
 * O cron da Vercel chega com `Authorization: Bearer $CRON_SECRET`.
 *
 * Sem `CRON_SECRET` configurado a rota fica aberta — vale em desenvolvimento,
 * mas em produção o segredo é obrigatório, senão qualquer um dispara o job.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get('authorization') === `Bearer ${secret}`;
}
