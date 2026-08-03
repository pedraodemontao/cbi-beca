export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span
            aria-hidden
            className="mx-auto mb-4 grid size-14 place-items-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#2E9463] to-primary-deep text-xl font-extrabold text-white shadow-soft"
          >
            B
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Carteira da Beca
          </h1>
          <p className="mt-1 text-[0.95rem] font-medium text-muted-foreground">
            Seus investimentos, sem economês
          </p>
        </div>
        <div className="card-lg">{children}</div>
      </div>
    </div>
  );
}
