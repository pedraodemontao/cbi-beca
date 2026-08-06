/**
 * Avatar da Beca — a voz que fala com a usuária.
 *
 * Propositalmente diferente do `BrandMark`: a marca da Central CBI é um
 * contorno em ouro (institucional), a Beca é o disco cheio (pessoa). Quem lê
 * distingue quem está falando sem precisar de legenda.
 */

interface BecaAvatarProps {
  /** Lado do círculo em px. */
  size?: number;
}

export function BecaAvatar({ size = 44 }: BecaAvatarProps) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className="grid flex-none place-items-center rounded-full bg-primary font-extrabold text-primary-foreground"
    >
      B
    </span>
  );
}
