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
 * Também convida por e-mail e redefine senha. O convite é o caminho novo desde
 * o SMTP próprio (2026-08-18): a aluna recebe "Acesso liberado", clica, cai em
 * `/nova-senha` com sessão e escolhe a senha — sem CSV nem senha provisória.
 * É a MESMA chamada que o webhook da Kiwify faz na compra; aqui ela existe
 * para quem entra por fora da Kiwify (cortesia, turma antiga, teste).
 *
 * `senha` virou plano B: o "Esqueci minha senha" funciona pelo e-mail agora,
 * mas quem está com a aluna no WhatsApp às vezes resolve mais rápido assim.
 *
 * Uso:
 *   node scripts/acesso.mjs listar
 *   node scripts/acesso.mjs convidar maria@exemplo.com ["Maria Silva"] [outra@... ...]
 *   node scripts/acesso.mjs revogar maria@exemplo.com [outra@exemplo.com ...]
 *   node scripts/acesso.mjs restaurar maria@exemplo.com
 *   node scripts/acesso.mjs senha maria@exemplo.com              # gera uma nova
 *   node scripts/acesso.mjs senha --nova <senha> maria@... [...] # define uma
 */

import {
  adminRequest,
  findUserByEmail,
  generatePassword,
  listUsers,
} from './supabase-admin.mjs';

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

/**
 * Convida por e-mail.
 *
 * Aceita `email` ou `email "Nome Sobrenome"` — o nome vira `display_name` no
 * perfil, pelo mesmo gatilho que o cadastro em lote usa. Quem já tem acesso é
 * PULADA; quem foi convidada e nunca abriu o link recebe o convite de novo (o
 * admin API reenvia quando a conta ainda não confirmou); quem está revogada
 * é avisada, não restaurada — restaurar é decisão explícita, `restaurar`.
 *
 * O limite é o do remetente: 30 e-mails por hora (`rate_limit_email_sent`).
 * Turma maior que isso em uma tacada, usar `criar-alunos.mjs`, que não manda
 * e-mail nenhum.
 */
async function comandoConvidar(args) {
  // "email" e "email Nome Sobrenome": um token com @ abre um convite; o que
  // vem depois sem @ é o nome dele, até o próximo @.
  const convites = [];
  for (const arg of args) {
    if (arg.includes('@')) convites.push({ email: arg.trim().toLowerCase(), nome: null });
    else if (convites.length > 0) {
      const atual = convites[convites.length - 1];
      atual.nome = atual.nome ? `${atual.nome} ${arg}` : arg;
    }
  }

  if (convites.length === 0) {
    console.error('Informe pelo menos um e-mail. Ex.: node scripts/acesso.mjs convidar maria@exemplo.com "Maria Silva"');
    process.exit(1);
  }

  let enviados = 0;

  for (const { email, nome } of convites) {
    const user = await findUserByEmail(email);

    if (user && isRevoked(user)) {
      console.log(`  revogada        ${email} — restaure com "restaurar" se for o caso`);
      continue;
    }
    if (user && user.email_confirmed_at) {
      console.log(`  já tem acesso   ${email}`);
      continue;
    }

    const { ok, body } = await adminRequest('invite', {
      method: 'POST',
      body: { email, data: nome ? { display_name: nome } : undefined },
    });

    if (ok) {
      enviados++;
      console.log(`  ${user ? 'reenviado      ' : 'convidada      '} ${email}${nome ? ` (${nome})` : ''}`);
    } else {
      console.error(`  ERRO            ${email}: ${body.msg ?? body.message ?? 'falhou'}`);
    }
  }

  if (enviados > 0) {
    console.log(`\n${enviados} convite(s) enviado(s). O link leva a /nova-senha e vale por 1 hora;`);
    console.log('se expirar, rodar de novo reenvia.');
  }
}

/** Mínimo que o Supabase passou a exigir em 2026-08-13. */
const MIN_SENHA = 8;

/**
 * Redefine a senha.
 *
 * Sem `--nova`, gera uma diferente para cada conta — é o comportamento certo
 * para "esqueci a senha". Com `--nova`, todas recebem a MESMA, e aí o script
 * avisa: quem tem a senha e conhece o e-mail da outra pessoa entra na conta
 * dela, e os e-mails de uma turma são conhecidos entre si.
 */
async function comandoSenha(args) {
  const flagIndex = args.indexOf('--nova');
  const senhaFixa = flagIndex >= 0 ? args[flagIndex + 1] : null;
  // O guarda `flagIndex >= 0` não é decoração: sem `--nova` o índice é -1, e
  // `index !== flagIndex + 1` vira `index !== 0` — que descartava o primeiro
  // e-mail da lista. Com um e-mail só sobrava zero, e o script recusava dizendo
  // que nenhum foi informado; com vários, comia o primeiro sem avisar.
  const emails = args.filter(
    (arg, index) =>
      !arg.startsWith('--') &&
      (flagIndex < 0 || (index !== flagIndex && index !== flagIndex + 1))
  );

  if (flagIndex >= 0 && !senhaFixa) {
    console.error('--nova precisa vir seguido da senha.');
    process.exit(1);
  }
  if (senhaFixa && senhaFixa.length < MIN_SENHA) {
    console.error(`A senha precisa de pelo menos ${MIN_SENHA} caracteres — o banco recusa menos que isso.`);
    process.exit(1);
  }
  if (emails.length === 0) {
    console.error('Informe pelo menos um e-mail.');
    process.exit(1);
  }

  const definidas = [];

  for (const email of emails) {
    const user = await findUserByEmail(email);
    if (!user) {
      console.error(`  não encontrada  ${email}`);
      continue;
    }

    const senha = senhaFixa ?? generatePassword();
    const { ok, body } = await adminRequest(`admin/users/${user.id}`, {
      method: 'PUT',
      body: { password: senha },
    });

    if (ok) {
      definidas.push({ email: user.email, senha });
      console.log(`  senha trocada   ${user.email}`);
    } else {
      console.error(`  ERRO            ${email}: ${body.msg ?? body.message ?? 'falhou'}`);
    }
  }

  if (definidas.length === 0) return;

  if (senhaFixa) {
    console.log(`\n${definidas.length} conta(s) com a MESMA senha.`);
    console.log('Enquanto ninguém trocar, quem souber essa senha entra em qualquer');
    console.log('uma dessas contas — basta saber o e-mail. Peça a troca em /conta.');
  } else {
    console.log('\nSenhas geradas (entregue e não guarde):');
    for (const item of definidas) console.log(`  ${item.email.padEnd(38)} ${item.senha}`);
  }

  console.log('\nA senha anterior para de valer imediatamente.');
}

async function main() {
  const [comando, ...args] = process.argv.slice(2);

  if (comando === 'listar') return comandoListar();
  if (comando === 'convidar') return comandoConvidar(args);
  if (comando === 'revogar') return alterarAcesso(args, { revogar: true });
  if (comando === 'restaurar') return alterarAcesso(args, { revogar: false });
  if (comando === 'senha') return comandoSenha(args);

  console.error('Uso:');
  console.error('  node scripts/acesso.mjs listar');
  console.error('  node scripts/acesso.mjs convidar <email> ["Nome Sobrenome"] [email ...]');
  console.error('  node scripts/acesso.mjs revogar <email> [email ...]');
  console.error('  node scripts/acesso.mjs restaurar <email> [email ...]');
  console.error('  node scripts/acesso.mjs senha <email> [email ...]');
  console.error('  node scripts/acesso.mjs senha --nova <senha> <email> [email ...]');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
