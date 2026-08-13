import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  const supabase = await createClient();

  // Template de e-mail com token_hash (guia server-side do Supabase)
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // Template padrão com ?code= (fluxo PKCE)
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL('/login?erro=confirmacao', request.url));
}

/**
 * Destino depois de validar o token.
 *
 * A confirmação de cadastro cai na carteira; a redefinição de senha precisa
 * cair no formulário de nova senha, e é o `next` que separa os dois — o mesmo
 * token vale para os dois fluxos.
 *
 * **Só aceita caminho relativo começando com uma barra.** O valor vem da query
 * string, e sem essa checagem `?next=https://outro-site` transformaria a rota
 * num redirecionador aberto: o link sairia de um domínio confiável e levaria a
 * pessoa recém-autenticada para fora. `//host` também é barrado — o navegador
 * lê isso como URL absoluta com o protocolo atual.
 */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/carteira';
  return value;
}
