import Link from 'next/link';
import {
  buildCeilingProjection,
  safetyMargin,
  gordonCeiling,
  fiiCeiling,
  DEFAULT_PAYOUT,
  DEFAULT_FII_YIELD,
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

  // FII não tem lucro por cota, então nada aqui embaixo se aplica: o teto dele
  // sai do aluguel já distribuído. Mandar pro card próprio em vez de dizer que
  // "falta o balanço" — não falta, a conta é outra.
  if (asset.assetType === 'fii') {
    return <FiiCeilingCard asset={asset} price={price} />;
  }

  const projection = buildCeilingProjection({
    price,
    reportedProfit: asset.netIncome,
    manualProfit: override?.manualProfit ?? null,
    sharesOutstanding: asset.sharesOutstanding,
    bookValuePerShare: asset.vpa,
    payout,
  });

  const headline = projection.ceilings[0]?.ceiling ?? null;
  const margin = safetyMargin(headline, price);
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
            ? `Hoje ela custa ${formatBRL(price!)}, ou seja ${formatRatio(margin)} abaixo do teto. Essa folga é a tua margem de segurança: é o quanto do limite você não está pagando.`
            : `Hoje ela custa ${formatBRL(price!)}, acima do teto. Não sobra margem de segurança — comprando por esse preço, o dividendo rende menos que 6% ao ano pra você.`}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {projection.ceilings.slice(1).map(({ targetYield, ceiling, margin: yieldMargin }) => (
          <Item
            key={targetYield}
            label={`Pra render ${formatRatio(targetYield)}`}
            value={ceiling}
            margin={yieldMargin}
          />
        ))}
        <Item
          label="Graham"
          value={projection.graham}
          margin={safetyMargin(projection.graham, price)}
          hint="lucro + patrimônio"
        />
        <Item
          label="Gordon"
          value={gordon}
          margin={safetyMargin(gordon, price)}
          hint="dividendo crescendo 4% ao ano"
        />
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

/**
 * Preço teto de FII: rendimento pago em 12 meses dividido pelo yield desejado,
 * na régua de 9% ao ano que o mercado usa. Sem payout, sem Graham, sem Gordon —
 * fundo é obrigado a distribuir quase tudo que recebe.
 */
const FII_YIELDS = [0.08, DEFAULT_FII_YIELD, 0.1, 0.12] as const;

function FiiCeilingCard({
  asset,
  price,
}: {
  asset: CeilingAsset;
  price: number | null;
}) {
  const headline = fiiCeiling(asset.dividends12m);
  const margin = safetyMargin(headline, price);
  const monthly = asset.dividends12m === null ? null : asset.dividends12m / 12;

  if (headline === null) {
    return (
      <section className="card-lg">
        <h2 className="text-lg font-extrabold tracking-tight">Preço teto</h2>
        <p className="micro-hint mt-1">
          Ainda não tenho o que esse fundo distribuiu por cota nos últimos 12
          meses. Sem isso não dá pra calcular o teto dele.
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
        Até quanto pagar por cota pra que o aluguel desse fundo te renda o que
        você quer. Fundo imobiliário não tem lucro por cota — o teto sai direto do
        que ele já depositou.
      </p>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-panel bg-primary-wash px-5 py-4">
        <div>
          <p className="micro-label">
            Teto pra render {formatRatio(DEFAULT_FII_YIELD)} ao ano
          </p>
          <p className="num text-[clamp(1.8rem,7vw,2.4rem)] font-extrabold leading-none text-primary-deep">
            {formatBRL(headline)}
          </p>
        </div>
        {margin !== null && (
          <span className={`chip ${margin >= 0 ? 'chip-up' : 'chip-down'}`}>
            {margin >= 0 ? 'cota abaixo do teto' : 'cota acima do teto'}
          </span>
        )}
      </div>

      <p className="micro-hint mt-3">
        {margin === null
          ? 'Sem cotação eu não consigo comparar com o preço de hoje.'
          : margin >= 0
            ? `Hoje a cota custa ${formatBRL(price!)}, ou seja ${formatRatio(margin)} abaixo do teto. Essa folga é a tua margem de segurança.`
            : `Hoje a cota custa ${formatBRL(price!)}, acima do teto. Comprando por esse preço, o mesmo aluguel rende menos que ${formatRatio(DEFAULT_FII_YIELD)} ao ano pra você.`}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {FII_YIELDS.filter((y) => y !== DEFAULT_FII_YIELD).map((targetYield) => {
          const ceiling = fiiCeiling(asset.dividends12m, targetYield);
          return (
            <Item
              key={targetYield}
              label={`Pra render ${formatRatio(targetYield)}`}
              value={ceiling}
              margin={safetyMargin(ceiling, price)}
            />
          );
        })}
        <Item label="Rendeu em 12m" value={asset.dividends12m} />
        <Item label="Por mês" value={monthly} />
      </dl>

      <p className="micro-hint mt-4 border-t border-border pt-3">
        Conta usada pelo mercado: (rendimento mensal × 12) ÷ yield desejado. O que
        o fundo pagou no passado não obriga ele a repetir.
      </p>
    </section>
  );
}

function Item({
  label,
  value,
  margin,
  hint,
}: {
  label: string;
  value: number | null;
  /** Margem de segurança deste teto. Ausente nos cards que não são teto. */
  margin?: number | null;
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
      {margin !== null && margin !== undefined && (
        <p
          className={`num text-[0.7rem] font-bold ${
            margin >= 0 ? 'text-positive' : 'text-negative'
          }`}
        >
          {margin >= 0
            ? `${formatRatio(margin)} de margem`
            : `${formatRatio(Math.abs(margin))} acima do teto`}
        </p>
      )}
      {hint && <p className="text-[0.68rem] font-medium text-muted-foreground">{hint}</p>}
    </div>
  );
}

function formatReference(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
