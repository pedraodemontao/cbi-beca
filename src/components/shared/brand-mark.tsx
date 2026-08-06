/**
 * Monograma da Central CBI.
 *
 * Existe como componente porque a marca aparecia solta em quatro lugares, cada
 * um com o mesmo gradiente escrito na mão — trocar a identidade exigia caçar
 * hex por arquivo. Agora é um lugar só.
 *
 * Se um dia entrar uma logo em arquivo, é aqui que ela substitui o texto.
 */

interface BrandMarkProps {
  /** Lado do círculo em px. */
  size?: number;
  className?: string;
}

export function BrandMark({ size = 44, className = '' }: BrandMarkProps) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        // A borda fina em ouro é o que separa o círculo do fundo preto: sem ela
        // o disco desaparece, porque os dois pretos têm quase a mesma luz.
        borderWidth: Math.max(1, Math.round(size / 22)),
        fontSize: Math.round(size * 0.3),
        letterSpacing: '0.04em',
      }}
      className={`grid flex-none place-items-center rounded-full border-primary bg-background font-extrabold text-primary ${className}`}
    >
      CBI
    </span>
  );
}
