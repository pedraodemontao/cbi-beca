#!/usr/bin/env node
/**
 * Testes do módulo puro do webhook da Kiwify (`src/lib/kiwify.ts`).
 *
 *   node scripts/testar-kiwify.mjs
 *
 * Roda sem rede e sem banco. Node 24 lê o `.ts` direto (só tipos, sem enum);
 * é por isso que `lib/kiwify.ts` não importa nada com alias `@/`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  decideAccess,
  parseKiwifyEvent,
  parseProductFilter,
  verifyKiwifySignature,
} from '../src/lib/kiwify.ts';

const TOKEN = 'w9i3pvutvxe';

/** Payload no formato observado nas integrações reais (2026-08-18). */
function order(overrides = {}) {
  return {
    order_id: 'e2b0a3f4-1111-2222-3333-444455556666',
    order_ref: '9dAQA5a',
    order_status: 'paid',
    payment_method: 'credit_card',
    webhook_event_type: 'order_approved',
    Product: { product_id: 'prod-cbi', product_name: 'Central CBI' },
    Customer: {
      full_name: 'Maria da Silva',
      first_name: 'Maria',
      email: 'Maria.Silva@Exemplo.com',
      mobile: '+5511999999999',
      CPF: '00000000000',
    },
    Subscription: null,
    ...overrides,
  };
}

function sign(body, token = TOKEN) {
  return createHmac('sha1', token).update(body).digest('hex');
}

test('assinatura: aceita HMAC do corpo bruto', () => {
  const raw = JSON.stringify(order());
  assert.equal(verifyKiwifySignature(raw, sign(raw), TOKEN), true);
});

test('assinatura: aceita HMAC do corpo re-serializado quando o bruto tem espaço', () => {
  const pretty = JSON.stringify(order(), null, 2);
  const canonical = JSON.stringify(JSON.parse(pretty));
  assert.equal(verifyKiwifySignature(pretty, sign(canonical), TOKEN), true);
});

test('assinatura: recusa token errado, ausência e tamanho diferente', () => {
  const raw = JSON.stringify(order());
  assert.equal(verifyKiwifySignature(raw, sign(raw, 'outro'), TOKEN), false);
  assert.equal(verifyKiwifySignature(raw, null, TOKEN), false);
  assert.equal(verifyKiwifySignature(raw, 'abc', TOKEN), false);
  assert.equal(verifyKiwifySignature(raw, sign(raw), ''), false);
});

test('parse: extrai e-mail minúsculo, nome, produto e status', () => {
  const event = parseKiwifyEvent(order());
  assert.deepEqual(event, {
    orderId: 'e2b0a3f4-1111-2222-3333-444455556666',
    eventType: 'order_approved',
    orderStatus: 'paid',
    subscriptionStatus: null,
    email: 'maria.silva@exemplo.com',
    name: 'Maria da Silva',
    productId: 'prod-cbi',
  });
});

test('parse: aceita apelidos minúsculos e devolve null sem forma de evento', () => {
  const event = parseKiwifyEvent({
    id: 'x',
    status: 'refunded',
    customer: { name: 'Zé', email: 'ze@x.com' },
    product: { id: 'p' },
  });
  assert.equal(event?.eventType, 'refunded');
  assert.equal(event?.email, 'ze@x.com');
  assert.equal(event?.productId, 'p');
  assert.equal(parseKiwifyEvent(null), null);
  assert.equal(parseKiwifyEvent('texto'), null);
  assert.equal(parseKiwifyEvent({ foo: 'bar' }), null);
});

test('decisão: compra aprovada libera; renovação libera como renovação', () => {
  assert.deepEqual(decideAccess(parseKiwifyEvent(order()), []), {
    kind: 'grant',
    reason: 'purchase',
  });
  assert.deepEqual(
    decideAccess(
      parseKiwifyEvent(order({ webhook_event_type: 'subscription_renewed', Subscription: { status: 'active' } })),
      []
    ),
    { kind: 'grant', reason: 'renewal' }
  );
});

test('decisão: reembolso, chargeback e cancelamento revogam', () => {
  const refund = order({ webhook_event_type: 'order_refunded', order_status: 'refunded' });
  assert.deepEqual(decideAccess(parseKiwifyEvent(refund), []), { kind: 'revoke', reason: 'refund' });

  const chargeback = order({ webhook_event_type: 'chargeback', order_status: 'chargedback' });
  assert.deepEqual(decideAccess(parseKiwifyEvent(chargeback), []), { kind: 'revoke', reason: 'chargeback' });

  // Só o status, sem tipo de evento reconhecido: revoga do mesmo jeito.
  const statusOnly = order({ webhook_event_type: 'algo_novo', order_status: 'chargedback' });
  assert.deepEqual(decideAccess(parseKiwifyEvent(statusOnly), []), { kind: 'revoke', reason: 'chargeback' });

  const canceled = order({ webhook_event_type: 'subscription_canceled', order_status: 'paid' });
  assert.deepEqual(decideAccess(parseKiwifyEvent(canceled), []), {
    kind: 'revoke',
    reason: 'subscription_canceled',
  });
});

test('decisão: renovação atrasada NÃO libera mesmo com order_status paid', () => {
  const late = order({
    webhook_event_type: 'subscription_late',
    order_status: 'paid',
    Subscription: { status: 'waiting_payment' },
  });
  assert.equal(decideAccess(parseKiwifyEvent(late), []).kind, 'ignore');
});

test('decisão: boleto, pix, recusada e carrinho abandonado são ignorados', () => {
  for (const [type, status] of [
    ['billet_created', 'waiting_payment'],
    ['pix_created', 'waiting_payment'],
    ['order_rejected', 'refused'],
    ['abandoned_cart', null],
  ]) {
    const event = parseKiwifyEvent(order({ webhook_event_type: type, order_status: status }));
    assert.equal(decideAccess(event, []).kind, 'ignore', type);
  }
});

test('decisão: filtro de produto ignora outros produtos e payload sem produto', () => {
  const event = parseKiwifyEvent(order());
  assert.equal(decideAccess(event, ['prod-cbi']).kind, 'grant');
  assert.equal(decideAccess(event, ['outro']).kind, 'ignore');
  assert.equal(decideAccess({ ...event, productId: null }, ['prod-cbi']).kind, 'ignore');
});

test('decisão: sem e-mail não libera nem revoga', () => {
  const event = parseKiwifyEvent(order({ Customer: { full_name: 'X' } }));
  assert.equal(decideAccess(event, []).kind, 'ignore');
});

test('parseProductFilter: vírgula, espaço e vazio', () => {
  assert.deepEqual(parseProductFilter(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(parseProductFilter(undefined), []);
  assert.deepEqual(parseProductFilter(''), []);
});
