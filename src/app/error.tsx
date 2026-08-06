'use client';

import { BrandMark } from '@/components/shared/brand-mark';
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <BrandMark size={56} />
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">
          Ops, deu ruim aqui do meu lado
        </h1>
        <p className="mt-2 text-[0.95rem] font-medium text-muted-foreground">
          Não foi culpa sua. Às vezes a cotação demora ou a conexão falha —
          tenta de novo que costuma resolver.
        </p>
      </div>
      <button type="button" onClick={reset} className="btn-primary">
        Tentar de novo
      </button>
    </main>
  );
}
