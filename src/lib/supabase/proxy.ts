import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() renova o token expirado; sem isso a sessão morre no server
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Portão de entrada, além do `redirect` que cada página já faz.
  //
  // Hoje todas as rotas protegidas checam a sessão por conta própria — e todas
  // acertam. Mas essa é uma garantia que depende de lembrar: uma página nova
  // que esqueça o `getUser()` vira vazamento silencioso. Aqui a regra é
  // invertida — protegido por padrão, aberto só o que está na lista.
  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = '/login';
    login.search = '';
    return NextResponse.redirect(login);
  }

  return supabaseResponse;
}

/**
 * Rotas que existem justamente para quem ainda não tem sessão.
 *
 * `/nova-senha` NÃO entra aqui de propósito: quem chega nela vem do link do
 * e-mail, que passa antes por `/auth/confirm` e já sai de lá com sessão. Deixá-la
 * pública abriria um formulário de trocar senha para quem não provou ser dona
 * da conta.
 */
// `/api/webhooks` é chamado pela Kiwify, que não tem sessão: sem a exceção o
// portão responderia 307 para `/login` e ela registraria o webhook como falho.
// A rota se protege sozinha, pela assinatura HMAC.
const PUBLIC_PREFIXES = ['/login', '/cadastro', '/recuperar', '/auth', '/api/cron', '/api/webhooks'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
