'use client';

import { useCallback, useState } from 'react';

interface NewsImageProps {
  src: string;
  /** Só pro `key` do estado: trocar de matéria precisa limpar a falha. */
  itemId: string;
}

/**
 * A foto da matéria, que some sozinha quando não carrega.
 *
 * Precisa ser client pelo mesmo motivo do `AssetLogo`: a URL só se revela
 * quebrada no navegador. E aqui quebrar é caso comum, não exceção — o host das
 * fotos do Valor Investe (`s2-valorinveste.glbimg.com`) nem resolve em DNS, e
 * cada portal serve de um domínio próprio que pode bloquear hotlink a
 * qualquer momento. Sem isso, meia dúzia de ícones de imagem quebrada
 * apareceria na grade.
 *
 * `referrerPolicy="no-referrer"` porque parte dos portais recusa requisição
 * vinda de fora — e o endereço da página não tem por que viajar junto.
 *
 * `<img>` nativo em vez de `next/image`: cada portal é um host diferente, e
 * liberar todos em `remotePatterns` abriria o otimizador pra domínio de
 * terceiro. Fora que foto de matéria queimaria a cota de otimização do plano
 * Hobby sem economizar byte nenhum.
 */
export function NewsImage({ src, itemId }: NewsImageProps) {
  const [failed, setFailed] = useState(false);

  /**
   * `onError` sozinho não basta, e foi medido: duas fotos continuavam no DOM
   * com `naturalWidth === 0`. A imagem já vai no HTML do servidor e começa a
   * carregar antes de o React hidratar — quando ela falha nesse intervalo, o
   * evento acontece sem ninguém escutando e o handler nunca roda.
   *
   * O ref fecha essa janela: na montagem, imagem com `complete` verdadeiro e
   * largura zero é imagem que já falhou. O `onError` continua valendo pro
   * caso normal, que com `loading="lazy"` é a regra — a maioria só começa a
   * carregar quando entra na tela, muito depois da hidratação.
   */
  const checkAlreadyFailed = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setFailed(true);
  }, []);

  if (failed) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={itemId}
      ref={checkAlreadyFailed}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="aspect-[16/9] w-full bg-panel object-cover"
    />
  );
}
