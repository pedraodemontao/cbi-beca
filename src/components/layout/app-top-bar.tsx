'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandMark } from '@/components/shared/brand-mark';
import { ThemeToggle } from '@/components/layout/theme-toggle';

/**
 * Faixa do topo: marca à esquerda, troca de tema à direita.
 *
 * Antes o botão de tema era `fixed` e flutuava sobre o conteúdo. Com a marca
 * entrando no topo isso deixou de servir: logo fixa no canto esquerdo cairia
 * em cima do `<h1>` de toda página no celular, onde o container tem só 20px de
 * respiro. A faixa resolve os dois de uma vez — nada se sobrepõe, e a marca
 * fica visível em qualquer tela.
 */
export function AppTopBar() {
  const pathname = usePathname();

  // Login e cadastro já mostram a marca grande no meio da tela; repetir no topo
  // seria a mesma logo duas vezes na mesma dobra. O botão de tema fica — é lá
  // que alguém pode querer trocar antes mesmo de entrar.
  const showMark = !pathname.startsWith('/login') && !pathname.startsWith('/cadastro');

  return (
    <header
      // Sem marca não há faixa: o que sobra é o botão de tema flutuando no
      // canto. Enquanto a barra pintava fundo e borda em toda rota, o login
      // abria com 56px de nada e uma linha divisória cortando o degradê do
      // fundo — chrome de aplicativo numa tela que ainda não é aplicativo.
      className={`sticky top-0 z-40 ${
        showMark
          ? 'border-b border-border/70 bg-background/85 backdrop-blur'
          : 'pointer-events-none bg-transparent'
      }`}
      // O respiro de cima acompanha a barra de status do iPhone: o app abre em
      // `black-translucent`, então sem isso a marca fica embaixo do relógio.
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-5">
        {showMark ? (
          // Símbolo + nome, não só o símbolo: em 30px de altura o monograma
          // dentro do hexágono vira borrão, e quem não conhece a marca não lê
          // "CBI" ali. O texto carrega o nome e o desenho fica de assinatura.
          <Link
            href="/preco-teto"
            aria-label="Central CBI — início"
            className="flex items-center gap-2.5"
          >
            <BrandMark size={34} />
            <span className="text-[0.82rem] font-extrabold uppercase tracking-[0.18em] text-foreground">
              Central CBI
            </span>
          </Link>
        ) : (
          <span />
        )}
        {/* O `pointer-events-none` da faixa transparente cobriria o botão
            junto; ele volta a receber clique aqui. */}
        <span className="pointer-events-auto">
          <ThemeToggle />
        </span>
      </div>
    </header>
  );
}
