import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook da Kiwify: assinatura e decisão de acesso. 100% função pura — sem
 * rede, sem banco — para ser testável sem subir nada (`node scripts/testar-kiwify.mjs`).
 *
 * O formato do payload NÃO está na documentação pública da Kiwify
 * (docs.kiwify.com.br cobre só a API REST e os gatilhos que um webhook pode
 * assinar). O que está aqui foi cruzado entre quatro implementações
 * independentes em 2026-08-18 e coincide em todas:
 *
 *   - assinatura: HMAC-SHA1, chave = token do webhook (o painel gera um por
 *     webhook), mensagem = `JSON.stringify(body)`, hex, no query param
 *     `?signature=`;
 *   - corpo: `order_id`, `order_status` (`paid`, `waiting_payment`, `refused`,
 *     `refunded`, `chargedback`), `webhook_event_type` (`order_approved`,
 *     `order_refunded`, `subscription_canceled`, `subscription_late`,
 *     `subscription_renewed`…), `Customer.{email,full_name}`,
 *     `Product.{product_id,product_name}`, `Subscription.status`.
 *
 * Por ser reconstituído e não lido de spec, o parser aceita apelidos
 * (`customer` minúsculo, `product.id`) e a rota guarda o payload bruto — a
 * primeira entrega real é a fonte de verdade, e vai estar em `access_events`.
 */

export interface KiwifyEvent {
  orderId: string | null;
  eventType: string;
  orderStatus: string | null;
  subscriptionStatus: string | null;
  email: string | null;
  name: string | null;
  productId: string | null;
}

export type AccessDecision =
  | { kind: 'grant'; reason: 'purchase' | 'renewal' }
  | { kind: 'revoke'; reason: 'refund' | 'chargeback' | 'subscription_canceled' }
  | { kind: 'ignore'; reason: string };

/**
 * A Kiwify assina `JSON.stringify(body)` — o corpo re-serializado, não
 * necessariamente os bytes que chegaram. Se ela mandar JSON compacto os dois
 * coincidem; se mandar com espaço, só o re-serializado bate. Conferir os dois
 * custa um HMAC a mais e evita recusar webhook legítimo por formatação.
 */
export function verifyKiwifySignature(
  rawBody: string,
  signature: string | null,
  token: string
): boolean {
  if (!signature || !token) return false;

  const candidates = [rawBody];
  try {
    candidates.push(JSON.stringify(JSON.parse(rawBody)));
  } catch {
    // corpo não é JSON: só o bruto concorre, e vai falhar adiante de qualquer jeito
  }

  const received = Buffer.from(signature.trim().toLowerCase(), 'utf8');

  return candidates.some((message) => {
    const expected = Buffer.from(
      createHmac('sha1', token).update(message, 'utf8').digest('hex'),
      'utf8'
    );
    return expected.length === received.length && timingSafeEqual(expected, received);
  });
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Devolve `null` quando o corpo não tem nem a cara de um evento de venda. */
export function parseKiwifyEvent(payload: unknown): KiwifyEvent | null {
  const body = record(payload);
  if (!body) return null;

  const customer = record(body.Customer) ?? record(body.customer);
  const product = record(body.Product) ?? record(body.product);
  const subscription = record(body.Subscription) ?? record(body.subscription);

  const orderStatus = text(body.order_status) ?? text(body.status);
  const eventType =
    text(body.webhook_event_type) ?? text(body.event) ?? text(body.type) ?? orderStatus;
  if (!eventType) return null;

  const email = text(customer?.email)?.toLowerCase() ?? null;

  return {
    orderId: text(body.order_id) ?? text(body.id),
    eventType,
    orderStatus,
    subscriptionStatus: text(subscription?.status),
    email,
    name:
      text(customer?.full_name) ??
      text(customer?.name) ??
      text(customer?.first_name),
    productId: text(product?.product_id) ?? text(product?.id),
  };
}

const REVOKE_BY_STATUS: Record<string, 'refund' | 'chargeback'> = {
  refunded: 'refund',
  chargedback: 'chargeback',
};

const REVOKE_BY_EVENT: Record<string, 'refund' | 'chargeback' | 'subscription_canceled'> = {
  order_refunded: 'refund',
  compra_reembolsada: 'refund',
  chargeback: 'chargeback',
  order_chargedback: 'chargeback',
  subscription_canceled: 'subscription_canceled',
};

const GRANT_EVENTS = new Set(['order_approved', 'compra_aprovada', 'subscription_renewed']);

/**
 * O que fazer com o evento.
 *
 * A ordem importa: `subscription_late` chega com o `order_status` da compra
 * original (`paid`), e olhar só o status liberaria acesso para quem está com
 * a renovação atrasada — por isso o tipo de evento é lido ANTES do status.
 * Reembolso e chargeback vencem qualquer outra leitura.
 */
export function decideAccess(event: KiwifyEvent, allowedProducts: string[]): AccessDecision {
  if (allowedProducts.length > 0) {
    if (!event.productId) return { kind: 'ignore', reason: 'payload sem product_id, e há filtro de produto' };
    if (!allowedProducts.includes(event.productId)) {
      return { kind: 'ignore', reason: `produto ${event.productId} fora da lista` };
    }
  }

  if (!event.email) return { kind: 'ignore', reason: 'payload sem e-mail do comprador' };

  if (event.eventType === 'subscription_late') {
    return { kind: 'ignore', reason: 'renovação atrasada: sem ação até cancelar ou renovar' };
  }

  const revokeByEvent = REVOKE_BY_EVENT[event.eventType];
  if (revokeByEvent) return { kind: 'revoke', reason: revokeByEvent };

  const revokeByStatus = event.orderStatus ? REVOKE_BY_STATUS[event.orderStatus] : undefined;
  if (revokeByStatus) return { kind: 'revoke', reason: revokeByStatus };

  if (GRANT_EVENTS.has(event.eventType) || event.orderStatus === 'paid') {
    return {
      kind: 'grant',
      reason: event.eventType === 'subscription_renewed' ? 'renewal' : 'purchase',
    };
  }

  return { kind: 'ignore', reason: `evento ${event.eventType} não muda acesso` };
}

/** `KIWIFY_PRODUCT_IDS="id1, id2"` → `['id1','id2']`; vazio → sem filtro. */
export function parseProductFilter(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
