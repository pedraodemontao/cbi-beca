import Link from 'next/link';
import {
  buildCeilingProjection,
  ceilingMargin,
  gordonCeiling,
  DEFAULT_PAYOUT,
} from '@/lib/ceiling-price';
import { formatBRL, formatRatio } from '@/lib/format';
import type { AppliedOverride, CeilingAsset } from '@/types/ceiling';

/**
 * Preço teto de UM ativo, dentro da página dele.
 *
 * É estático de propósito — quem quer mexer no payout tem a tabela em
 * `/preco-teto`. Aqui o papel é responder "esse preço tá bom?" de bate-pronto.
 */

/** Mesmas premissas de Gordon que a tabela abre por padrão. */
const REQUIRED_RETURN = 0.1;
const GROWTH = 0.04;

interface CeilingCardProps {
  asset: CeilingAsset;
  override: AppliedOverride | undefined;
  /** Preço ao vivo da brapi; o do catálogo é o plano B. */
  livePrice: number | null;
}

export function CeilingCard({ asset, override, livePrice }: CeilingCardProps) {
  const price = livePrice ?? asset.price;
  const payout = override?.payout ?? DEFAULT_PAYOUT;

  const projection = buildCeilingProjection({
    price,
    reportedProfit: asset.netIncome,
    manualProfit: override?.manualProfit ?? null,
    sharesOutstanding: asset.sharesOutstanding,
    bookValuePerShare: asset.vpa,
    payout,
  });

  const headline = projection.ceilings[0]?.ceiling ?? null;
  const margin = ceilingMargin(headline, price);
  const nextDividend = projection.dps === null ? null : projection.dps * (1 + GROWTH);
  const gordon = gordonCeiling(nextDividend, REQUIRED_RETURN, GROWTH);

  if (projection.eps === null) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">Preço teto</h2>
        <p className="micro-hint mt-1">
          Ainda não tenho o lucro dessa empresa pra calcular o teto. Assim que o
          balanço dela entrar na minha base, aparece aqui.
        </p>
      </section>
    );
  }

  return (
    <section className="card-lg">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-extrabold tracking-tight">Preço teto</h2>
        <Link href="/preco-teto" className="text-sm font-bold text-primary hover:underline">
          Ver a tabela toda
        </Link>
      </div>
      <p className="micro-hint">
        Até quanto pagar pra que o dividendo dessa empresa te renda o que você
        quer. Considerando que ela distribui {Math.round(payout * 100)}% do lucro.
      </p>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-panel bg-primary-wash px-5 py-4">
        <div>
          <p className="micro-label">Teto pra render 6% ao ano</p>
          <p className="num text-[clamp(1.8rem,7vw,2.4rem)] font-extrabold leading-none text-primary-deep">
            {headline === null ? '—' : formatBRL(headline)}
          </p>
        </div>
        {margin !== null && (
          <span className={`chip ${margin >= 0 ? 'chip-up' : 'chip-down'}`}>
            {margin >= 0 ? 'preço abaixo do teto' : 'preço acima do teto'}
          </span>
        )}
      </div>

      <p className="micro-hint mt-3">
        {margin === null
          ? 'Sem cotação eu não consigo comparar com o preço de hoje.'
          : margin >= 0
            ? `Hoje ela custa ${formatBRL(price!)}: o teto é ${formatRatio(margin)} maior que isso, então ainda dá pra comprar pagando menos que o limite.`
            : `Hoje ela custa ${formatBRL(price!)}: o teto é ${formatRatio(Math.abs(margin))} menor que isso. Comprando por esse preço, o dividendo rende menos que 6% ao ano pra você.`}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {projection.ceilings.slice(1).map(({ targetYield, ceiling }) => (
          <Item
            key={targetYield}
            label={`Pra render ${formatRatio(targetYield)}`}
            value={ceiling}
          />
        ))}
        <Item label="Graham" value={projection.graham} hint="lucro + patrimônio" />
        <Item label="Gordon" value={gordon} hint="dividendo crescendo 4% ao ano" />
      </dl>

      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Item label="Lucro por ação" value={projection.eps} />
        <Item label="Dividendo previsto" value={projection.dps} />
      </dl>

      {asset.referenceDate && (
        <p className="micro-hint mt-4 border-t border-border pt-3">
          Lucro do balanço de {formatReference(asset.referenceDate)} — é o mais
          recente que a CVM publicou, e não o de hoje.
        </p>
      )}
    </section>
  );
}

function Item({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <div className="rounded-panel bg-background px-3 py-2.5">
      <dt className="text-[0.68rem] font-extrabold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="num text-base font-bold">
        {value === null ? '—' : formatBRL(value)}
      </dd>
      {hint && <p className="text-[0.68rem] font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatReference(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
