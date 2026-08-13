/**
 * O pouco que os scripts de administração de acesso compartilham: achar as
 * chaves e falar com o admin API do Supabase.
 *
 * Mora aqui porque `criar-alunos.mjs` e `acesso.mjs` fazem a MESMA leitura de
 * `.env.local` e a mesma montagem de cabeçalho com a service role. Duas cópias
 * de uma função que carrega credencial é o tipo de duplicação que sai cara: se
 * uma das duas errar o nome da variável, o erro aparece como "não achei a
 * aluna" em vez de "falta a chave".
 */

import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';

/**
 * Alfabeto sem os caracteres que se confundem lidos em voz alta ou copiados de
 * um print: O/0, I/l/1. A senha provisória vai ser digitada à mão por alguém
 * lendo de outra tela.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 12;

export function generatePassword() {
  let password = '';
  for (let index = 0; index < PASSWORD_LENGTH; index++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}

export function requireEnv(name) {
  const value = process.env[name];
  if (value) return value;

  // Sem variável no ambiente, lê do .env.local — é onde elas moram no projeto.
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const line = env.split('\n').find((row) => row.startsWith(`${name}=`));
    const parsed = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
    if (parsed) return parsed;
  } catch {
    // cai no erro abaixo
  }

  console.error(`Falta ${name} no ambiente ou no .env.local.`);
  process.exit(1);
}

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_ROLE = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

/**
 * Chamada ao admin API. Devolve `{ status, body }` em vez de lançar: quem chama
 * precisa distinguir "já existia" de "deu erro de verdade", e exceção obrigaria
 * a inspecionar a mensagem dentro de um catch.
 */
export async function adminRequest(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text };
  }

  return { status: response.status, ok: response.ok, body: parsed };
}

/**
 * Todas as contas, paginadas.
 *
 * O admin API devolve 50 por página por padrão e NÃO avisa que cortou — a
 * turma passar de 50 faria a busca por e-mail simplesmente não achar quem está
 * na página 2, e o script diria "conta não encontrada" para alguém que existe.
 */
export async function listUsers() {
  const users = [];

  for (let page = 1; ; page++) {
    const { ok, body } = await adminRequest(`admin/users?page=${page}&per_page=200`);
    if (!ok) break;

    const batch = body.users ?? [];
    users.push(...batch);
    if (batch.length < 200) break;
  }

  return users;
}

/** Acha a conta pelo e-mail, sem diferenciar maiúscula de minúscula. */
export async function findUserByEmail(email) {
  const target = email.trim().toLowerCase();
  const users = await listUsers();
  return users.find((user) => (user.email ?? '').toLowerCase() === target) ?? null;
}
