import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-5 py-16 text-center">
      <h1 className="text-xl font-extrabold tracking-tight">
        Página não encontrada
      </h1>
      <p className="text-[0.95rem] font-medium text-muted-foreground">
        O endereço pode estar incorreto ou o ativo não consta no catálogo da B3.
      </p>
      <Link href="/carteira" className="btn-primary">
        Ir para a carteira
      </Link>
    </main>
  );
}
