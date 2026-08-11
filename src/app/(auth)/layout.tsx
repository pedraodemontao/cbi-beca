import { BrandMark } from '@/components/shared/brand-mark';

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <BrandMark size={56} className="mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold uppercase tracking-[0.18em] text-foreground">
            Central CBI
          </h1>
          <p className="mt-1 text-[0.95rem] font-medium text-muted-foreground">
            Acompanhamento de carteira e preço teto
          </p>
        </div>
        <div className="card-lg">{children}</div>
      </div>
    </div>
  );
}
