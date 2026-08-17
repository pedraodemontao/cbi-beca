import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

/**
 * O export PRECISA se chamar `config`.
 *
 * O rename de `middleware` pra `proxy` no Next 16 trocou o nome do arquivo e o
 * da função, e só. `proxyConfig` não existe na API: o Next não acha o objeto,
 * assume que não há matcher e — nas palavras da própria doc — roda o proxy em
 * toda requisição, "including static files (`_next/static`), image
 * optimizations (`_next/image`), and assets in the `public/` folder".
 *
 * Com o portão de sessão aqui dentro, isso significa CSS, JS e a logo levando
 * 307 pra `/login` (medido em desenvolvimento). Em produção o defeito ficava
 * escondido porque a Vercel serve estático pela CDN, antes da função — mas
 * cada requisição que chegava na função pagava um `getUser()` à toa.
 */
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
