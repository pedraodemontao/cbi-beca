import Image from 'next/image';

/**
 * Marca da Central CBI: hexágono com o monograma e a seta de alta.
 *
 * Substituiu o monograma em texto que existia antes — o comentário de lá já
 * previa isso ("se um dia entrar uma logo em arquivo, é aqui que ela substitui
 * o texto"), e por ela estar num componente só a troca não vazou pra nenhuma
 * tela.
 *
 * Vai `unoptimized` pelo mesmo motivo do `AssetLogo`: o PNG já sai pronto no
 * tamanho de uso e o plano Hobby tem cota de otimização de imagem — não há byte
 * a ganhar aqui.
 */

/** A arte não é quadrada: a seta sobe além do hexágono. */
const ASPECT = 535 / 570;

interface BrandMarkProps {
  /** Altura em px; a largura acompanha a proporção da arte. */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 44, className = '' }: BrandMarkProps) {
  const width = Math.round(size * ASPECT);

  return (
    // Duas artes no HTML e o CSS esconde uma, como no botão de tema: o servidor
    // não sabe em que tema a página vai abrir, e escolher em JS pintaria a
    // versão errada até a hidratação.
    <span
      aria-hidden
      className={`relative flex flex-none items-center justify-center ${className}`}
      style={{ width, height: size }}
    >
      <Image
        src="/brand-mark.png"
        alt=""
        width={width}
        height={size}
        unoptimized
        priority
        className="dark-only"
      />
      {/* O ouro da arte é claro: sobre papel ele dá 1,9:1 e some. A versão do
          tema claro nasce escurecida, mesma decisão que o `--primary` já
          tinha tomado. */}
      <Image
        src="/brand-mark-light.png"
        alt=""
        width={width}
        height={size}
        unoptimized
        priority
        className="light-only"
      />
    </span>
  );
}
