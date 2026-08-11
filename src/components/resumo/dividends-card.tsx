import type { UpcomingDividend } from '@/types/portfolio';

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

interface DividendsCardProps {
  dividends: UpcomingDividend[];
}

export function DividendsCard({ dividends }: DividendsCardProps) {
  return (
    <section className="card-lg">
      <h2 className="text-lg font-extrabold tracking-tight">
        Próximos proventos
      </h2>
      <p className="micro-hint">
        Pagamentos já anunciados pelos ativos em carteira.
      </p>

      {dividends.length === 0 ? (
        <p className="mt-4 rounded-panel bg-background px-4 py-3 text-sm font-medium text-muted-foreground">
          Nenhum pagamento anunciado no momento. Empresas e fundos costumam
          divulgar as distribuições com pouca antecedência.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-border">
          {dividends.slice(0, 8).map((dividend, index) => (
            <li
              key={`${dividend.ticker}-${dividend.paymentDate}-${index}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div>
                <p className="font-extrabold">{dividend.ticker}</p>
                <p className="text-xs font-semibold text-muted-foreground">
                  {dividend.label ?? 'Provento'} ·{' '}
                  {dateFormatter.format(new Date(dividend.paymentDate))}
                </p>
              </div>
              {dividend.rate !== null && (
                <span className="num chip chip-up">
                  {rateFormatter.format(dividend.rate)} por cota
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
