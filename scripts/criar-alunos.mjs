#!/usr/bin/env node
/**
 * Cria as contas das alunas em lote, já confirmadas, com senha provisória.
 *
 * Existe porque o cadastro por conta própria depende de e-mail, e o projeto
 * está no plano gratuito do Supabase: o remetente embutido manda 2 e-mails por
 * HORA e é declaradamente só para teste. Uma turma inteira se cadastrando
 * sozinha não recebe a confirmação. Aqui a conta nasce confirmada
 * (`email_confirm: true`) e nenhum e-mail é disparado.
 *
 * A senha provisória é entregue por fora da plataforma (WhatsApp, aula, o que
 * for) e a aluna troca por uma sua em `/conta` no primeiro acesso.
 *
 * Uso:
 *   node scripts/criar-alunos.mjs alunos.txt            # cria de verdade
 *   node scripts/criar-alunos.mjs alunos.txt --simular  # só mostra o que faria
 *
 * O arquivo tem uma aluna por linha, `email` ou `email,Nome Sobrenome`:
 *   maria@exemplo.com,Maria Souza
 *   joao@exemplo.com
 *
 * Linha em branco e linha começando com `#` são ignoradas. Rodar de novo é
 * seguro: quem já existe é PULADA, nunca sobrescrita — reexecutar não troca a
 * senha de quem já entrou e já escolheu a dela.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { adminRequest } from './supabase-admin.mjs';

/**
 * Alfabeto sem os caracteres que se confundem lidos em voz alta ou copiados de
 * um print: O/0, I/l/1. A senha provisória vai ser digitada à mão por alguém
 * lendo de outra tela.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 12;

function generatePassword() {
  let password = '';
  for (let index = 0; index < PASSWORD_LENGTH; index++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}

function parseRoster(path) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const students = [];
  const seen = new Set();

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;

    const [emailPart, ...nameParts] = line.split(',');
    const email = emailPart.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      console.error(`  linha ${index + 1}: "${line}" não parece um e-mail — ignorada`);
      return;
    }
    if (seen.has(email)) {
      console.error(`  linha ${index + 1}: ${email} repetido no arquivo — ignorado`);
      return;
    }

    seen.add(email);
    students.push({
      email,
      displayName: nameParts.join(',').trim() || email.split('@')[0],
    });
  });

  return students;
}

async function createStudent({ email, displayName }) {
  const password = generatePassword();

  const { ok, status, body } = await adminRequest('admin/users', {
    method: 'POST',
    body: {
      email,
      password,
      // Nasce confirmada: nenhum e-mail é enviado e a aluna entra na hora.
      email_confirm: true,
      // O gatilho de signup lê daqui para preencher `profiles.display_name`.
      user_metadata: { display_name: displayName },
    },
  });

  if (ok) return { status: 'criada', password };

  const message = body.msg ?? body.message ?? body.error_description ?? '';

  if (status === 422 || /already|registered|exists/i.test(message)) {
    return { status: 'ja-existia' };
  }
  return { status: 'erro', message: message || `HTTP ${status}` };
}

async function main() {
  const [rosterPath, ...flags] = process.argv.slice(2);
  const dryRun = flags.includes('--simular');

  if (!rosterPath) {
    console.error('Uso: node scripts/criar-alunos.mjs <arquivo> [--simular]');
    process.exit(1);
  }

  const students = parseRoster(rosterPath);
  if (students.length === 0) {
    console.error('Nenhuma aluna válida no arquivo.');
    process.exit(1);
  }

  console.log(`${students.length} aluna(s) no arquivo.`);
  if (dryRun) {
    students.forEach((student) => console.log(`  [simulação] ${student.email} — ${student.displayName}`));
    console.log('\nNada foi criado. Rode sem --simular para valer.');
    return;
  }

  const created = [];
  let skipped = 0;
  let failed = 0;

  for (const student of students) {
    const result = await createStudent(student);

    if (result.status === 'criada') {
      created.push({ ...student, password: result.password });
      console.log(`  criada     ${student.email}`);
    } else if (result.status === 'ja-existia') {
      skipped++;
      console.log(`  já existia ${student.email} (senha intacta)`);
    } else {
      failed++;
      console.error(`  ERRO       ${student.email}: ${result.message}`);
    }
  }

  console.log(`\n${created.length} criada(s), ${skipped} já existia(m), ${failed} com erro.`);

  if (created.length === 0) return;

  // As senhas provisórias saem em CSV para você distribuir. É um arquivo com
  // credencial em texto puro: entregue e apague.
  const output = `senhas-provisorias-${new Date().toISOString().slice(0, 10)}.csv`;
  const csv = [
    'email,nome,senha_provisoria',
    ...created.map((s) => `${s.email},"${s.displayName}",${s.password}`),
  ].join('\n');
  writeFileSync(output, `${csv}\n`, { mode: 0o600 });

  console.log(`\nSenhas provisórias em ${output} (só você consegue ler).`);
  console.log('Entregue a cada aluna e APAGUE o arquivo. Elas trocam a senha em /conta.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
