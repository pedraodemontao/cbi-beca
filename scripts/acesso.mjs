#!/usr/bin/env node
/**
 * Revoga e devolve o acesso de uma aluna, sem tocar nos dados dela.
 *
 * É o caminho inverso de `criar-alunos.mjs`, e existe por causa de reembolso e
 * chargeback: quando a compra cai, o acesso tem que cair junto — mas apagar a
 * conta levaria a carteira, os proventos calculados e os ajustes de preço teto,
 * o que é destrutivo demais para um estorno que pode ser revertido.
 *
 * A revogação usa o banimento nativo do Supabase (`ban_duration`), e não uma
 * coluna nossa, por três razões medidas em 2026-08-13:
 *
 *   1. Não precisa de migration nem de consulta ao banco em toda requisição —
 *      uma coluna própria obrigaria o proxy a checar o estado a cada acesso.
 *   2. Derruba a sessão ABERTA na hora: o token já emitido passa a responder
 *      403, em vez de valer até expirar. Revogar acesso que só vale na próxima
 *      hora não é revogar.
 *   3. É reversível sem perder nada — restaurar é uma chamada, e a carteira
 *      continua exatamente como estava.
 *
 * Uso:
 *   node scripts/acesso.mjs listar
 *   node scripts/acesso.mjs revogar maria@exemplo.com [outra@exemplo.com ...]
 *   node scripts/acesso.mjs restaurar maria@exemplo.com
 */

import { adminRequest, findUserByEmail, listUsers } from './supabase-admin.mjs';

/**
 * Cem anos. O Supabase não tem banimento permanente — só duração —, então
 * "para sempre" é uma data longe o bastante para nunca chegar.
 */
const FOREVER = '876000h';

function isRevoked(user) {
  const until = user.banned_until;
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

async function comandoListar() {
  const users = await listUsers();
  if (users.length === 0) {
    console.log('Nenhuma conta.');
    return;
  }

  const ativas = users.filter((user) => !isRevoked(user));
  const revogadas = users.filter(isRevoked);

  console.log(`${users.length} conta(s): ${ativas.length} com acesso, ${revogadas.length} revogada(s).\n`);

  for (const user of [...ativas, ...revogadas]) {
    const nome = user.user_metadata?.display_name ?? '—';
    const ultimoAcesso = user.last_sign_in_at?.slice(0, 10) ?? 'nunca entrou';
    const marca = isRevoked(user) ? 'REVOGADA' : 'ativa   ';
    console.log(`  ${marca}  ${user.email.padEnd(38)} ${nome.padEnd(24)} último acesso: ${ultimoAcesso}`);
  }
}

async function alterarAcesso(emails, { revogar }) {
  if (emails.length === 0) {
    console.error(`Informe pelo menos um e-mail. Ex.: node scripts/acesso.mjs ${revogar ? 'revogar' : 'restaurar'} maria@exemplo.com`);
    process.exit(1);
  }

  let alteradas = 0;

  for (const email of emails) {
    const user = await findUserByEmail(email);

    if (!user) {
      console.error(`  não encontrada  ${email}`);
      continue;
    }

    const jaEstava = isRevoked(user) === revogar;
    if (jaEstava) {
      console.log(`  sem mudança     ${email} (já estava ${revogar ? 'revogada' : 'ativa'})`);
      continue;
    }

    const { ok, body } = await adminRequest(`admin/users/${user.id}`, {
      method: 'PUT',
      body: { ban_duration: revogar ? FOREVER : 'none' },
    });

    if (ok) {
      alteradas++;
      console.log(`  ${revogar ? 'revogada       ' : 'restaurada     '} ${email}`);
    } else {
      console.error(`  ERRO            ${email}: ${body.msg ?? body.message ?? 'falhou'}`);
    }
  }

  // Só explica o efeito quando ele de fato aconteceu: anunciar "a sessão caiu"
  // depois de "não encontrada" faria o script relatar uma ação que não houve.
  if (revogar && alteradas > 0) {
    console.log('\nA sessão aberta cai na hora — o token já emitido para de valer.');
    console.log('Os dados da conta (carteira, proventos, ajustes) continuam intactos.');
  }
}

async function main() {
  const [comando, ...args] = process.argv.slice(2);

  if (comando === 'listar') return comandoListar();
  if (comando === 'revogar') return alterarAcesso(args, { revogar: true });
  if (comando === 'restaurar') return alterarAcesso(args, { revogar: false });

  console.error('Uso:');
  console.error('  node scripts/acesso.mjs listar');
  console.error('  node scripts/acesso.mjs revogar <email> [email ...]');
  console.error('  node scripts/acesso.mjs restaurar <email> [email ...]');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
