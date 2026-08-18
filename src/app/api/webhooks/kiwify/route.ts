import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  decideAccess,
  parseKiwifyEvent,
  parseProductFilter,
  verifyKiwifySignature,
  type AccessDecision,
  type KiwifyEvent,
} from '@/lib/kiwify';
import { grantAccess, revokeAccess } from '@/lib/access';

/**
 * Webhook da Kiwify: a compra vira acesso, o reembolso tira.
 *
 * Contrato com a Kiwify:
 *   - ela chama `POST …/api/webhooks/kiwify?signature=<hmac>` com JSON;
 *   - 2xx é "recebido"; qualquer outra coisa faz ela reenviar. Por isso um
 *     evento que a gente entende mas decide ignorar responde 200, e só erro
 *     nosso (banco, admin API) responde 500 — para ela tentar de novo.
 *
 * Idempotente pelo par (order_id, tipo de evento) em `access_events`: a
 * segunda entrega do mesmo evento responde 200 sem fazer nada. Um evento que
 * terminou em erro NÃO conta como tratado — o reenvio dela é a nossa retentativa.
 *
 * `KIWIFY_DRY_RUN=1` grava a decisão sem executar. É para o primeiro contato
 * com o payload real: o formato não é documentado, e ver o que a Kiwify manda
 * antes de convidar alguém custa uma variável de ambiente.
 */

const SOURCE = 'kiwify';

export async function POST(request: Request) {
  const token = process.env.KIWIFY_WEBHOOK_TOKEN;
  if (!token) {
    console.error('[kiwify] KIWIFY_WEBHOOK_TOKEN ausente — webhook recusado.');
    return NextResponse.json({ error: 'Webhook não configurado.' }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = new URL(request.url).searchParams.get('signature');

  if (!verifyKiwifySignature(rawBody, signature, token)) {
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Corpo não é JSON.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const event = parseKiwifyEvent(payload);

  // Assinado e válido, mas sem cara de venda: fica registrado (é o que vai
  // mostrar o formato real) e responde 200 — não é erro da Kiwify nem nosso.
  if (!event) {
    await recordEvent(supabase, {
      event: null,
      action: 'ignored',
      detail: 'payload sem os campos de um evento de venda',
      payload,
    });
    return NextResponse.json({ ok: true, action: 'ignored' });
  }

  const decision = decideAccess(event, parseProductFilter(process.env.KIWIFY_PRODUCT_IDS));

  if (event.orderId && (await alreadyHandled(supabase, event))) {
    return NextResponse.json({ ok: true, action: 'duplicate' });
  }

  if (process.env.KIWIFY_DRY_RUN === '1') {
    await recordEvent(supabase, {
      event,
      action: 'dry_run',
      detail: describe(decision),
      payload,
    });
    return NextResponse.json({ ok: true, action: 'dry_run', decision });
  }

  try {
    const outcome = await execute(decision, event);
    await recordEvent(supabase, { event, action: outcome.action, detail: outcome.detail, payload });
    return NextResponse.json({ ok: true, action: outcome.action });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[kiwify] falha ao aplicar evento', event.orderId, message);
    await recordEvent(supabase, { event, action: 'error', detail: message, payload });
    return NextResponse.json({ error: 'Falha ao aplicar o evento.' }, { status: 500 });
  }
}

async function execute(decision: AccessDecision, event: KiwifyEvent) {
  if (decision.kind === 'ignore') {
    return { action: 'ignored', detail: decision.reason };
  }

  // `decideAccess` já garantiu o e-mail para grant/revoke.
  const email = event.email as string;

  if (decision.kind === 'grant') {
    const result = await grantAccess(email, event.name);
    return { action: result.action, detail: `${describe(decision)} · ${result.detail}` };
  }

  const result = await revokeAccess(email);
  return { action: result.action, detail: `${describe(decision)} · ${result.detail}` };
}

function describe(decision: AccessDecision): string {
  if (decision.kind === 'ignore') return `ignorar: ${decision.reason}`;
  return `${decision.kind}: ${decision.reason}`;
}

type Admin = ReturnType<typeof createAdminClient>;

async function alreadyHandled(supabase: Admin, event: KiwifyEvent): Promise<boolean> {
  const { data, error } = await supabase
    .from('access_events')
    .select('id')
    .eq('source', SOURCE)
    .eq('external_id', event.orderId)
    .eq('event_type', event.eventType)
    .neq('action', 'error')
    .limit(1);

  if (error) throw new Error(`consulta de duplicidade falhou: ${error.message}`);
  return (data ?? []).length > 0;
}

async function recordEvent(
  supabase: Admin,
  input: { event: KiwifyEvent | null; action: string; detail: string; payload: unknown }
) {
  const { error } = await supabase.from('access_events').insert({
    source: SOURCE,
    external_id: input.event?.orderId ?? null,
    event_type: input.event?.eventType ?? 'unknown',
    order_status: input.event?.orderStatus ?? null,
    email: input.event?.email ?? null,
    product_id: input.event?.productId ?? null,
    action: input.action,
    detail: input.detail,
    payload: input.payload,
  });

  // Não derruba a resposta: o acesso já foi (ou não) alterado, e devolver 500
  // aqui faria a Kiwify reenviar um evento já aplicado. Fica no log.
  if (error) console.error('[kiwify] falha ao gravar access_events', error.message);
}
