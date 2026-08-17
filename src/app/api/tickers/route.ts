import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchTickers } from '@/lib/brapi';
import { CRYPTO_IDS, CRYPTO_NAMES } from '@/lib/coingecko';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const query = new URL(request.url).searchParams.get('q') ?? '';
  const [matches, crypto] = await Promise.all([
    searchTickers(query),
    Promise.resolve(searchCrypto(query)),
  ]);

  // Cripto vem primeiro quando casa: a lista é curada e curta, então um acerto
  // aqui é mais provável de ser o que a pessoa quer do que o quinto resultado
  // da busca da B3.
  return NextResponse.json({ matches: [...crypto, ...(matches ?? [])] });
}

/**
 * Sugestões de criptomoeda, da lista curada em `lib/coingecko.ts`.
 *
 * A brapi não conhece cripto no plano contratado, então sem isto digitar
 * "BTC" não sugere nada e a aluna teria que saber que precisa trocar o tipo à
 * mão. Casa por sigla E por nome — quem digita "bitcoin" também acha.
 */
function searchCrypto(query: string) {
  const term = query.trim().toUpperCase();
  if (term.length < 2) return [];

  return Object.keys(CRYPTO_IDS)
    .filter(
      (symbol) =>
        symbol.startsWith(term) ||
        (CRYPTO_NAMES[symbol] ?? '').toUpperCase().startsWith(term)
    )
    .slice(0, 4)
    .map((symbol) => ({
      ticker: symbol,
      name: CRYPTO_NAMES[symbol] ?? symbol,
      // O formulário lê estes campos pra adivinhar o tipo; dizer "crypto"
      // aqui é o que faz o seletor já vir certo.
      assetType: 'crypto',
      subType: 'crypto',
    }));
}
