import type { BrapiDividend } from '@/lib/brapi';

const rateFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Sao_Paulo',
});

interface DividendsHistoryProps {
  dividends: BrapiDividend[] | null;
}

export function DividendsHistory({ dividends }: DividendsHistoryProps) {
  const recent = (dividends ?? [])
    .filter((dividend) => dividend.paymentDate && typeof dividend.rate === 'number')
    .sort(
      (a, b) =>
        new Date(b.paymentDate!).getTime() - new Date(a.paymentDate!).getTime()
    )
    .slice(0, 10);

  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Histórico de proventos
      </h2>
      <p className="micro-hint">
        O que esse ativo já pagou por cota nos últimos pagamentos.
      </p>

      {recent.length === 0 ? (
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
          Nenhum pagamento registrado por aqui. Nem todo ativo distribui
          proventos — muitas empresas preferem reinvestir o lucro.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {recent.map((dividend, index) => (
            <li
              key={`${dividend.paymentDate}-${index}`}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-bold">
                  {dateFormatter.format(new Date(dividend.paymentDate!))}
                </p>
                {dividend.label && (
                  <p className="text-xs font-semibold text-muted-foreground">
                    {dividend.label}
                  </p>
                )}
              </div>
              <span className="num font-extrabold text-primary-deep">
                {rateFormatter.format(dividend.rate!)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
