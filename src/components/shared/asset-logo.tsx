'use client';

import Image from 'next/image';
import { useState } from 'react';

/**
 * Logo do ativo, com as iniciais do ticker como plano B.
 *
 * Vai `unoptimized` de propósito: são ícones de 32px que já chegam pequenos da
 * brapi, e o plano Hobby da Vercel tem cota de otimização de imagem — passar
 * centenas de logos por pageview pelo pipeline queimaria a cota sem ganhar
 * nenhum byte.
 *
 * Nem todo logo responde, e a URL só se revela quebrada no client — daí o
 * componente ser client e guardar o erro em estado.
 */

interface AssetLogoProps {
  ticker: string;
  url: string | null;
  /** Lado do quadrado em px. */
  size?: number;
}

export function AssetLogo({ ticker, url, size = 32 }: AssetLogoProps) {
  const [failed, setFailed] = useState(false);

  const box = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.34),
  };

  if (!url || failed) {
    return (
      <span
        aria-hidden
        style={box}
        className="flex flex-none items-center justify-center rounded-full bg-primary-wash font-extrabold text-primary-deep"
      >
        {ticker.slice(0, 2)}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      onError={() => setFailed(true)}
      // As logos da brapi já vêm como ladrilho opaco 56×56 com fundo próprio
      // (a da B3 é um quadrado azul-marinho), então o `rounded-full` só recorta.
      // O fundo aqui é rede pra alguma que venha transparente.
      className="flex-none rounded-full bg-panel object-contain"
      style={{ width: size, height: size }}
    />
  );
}
