import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  fetchAppliedOverrides,
  fetchCeilingAssets,
  fetchComparableOptions,
  fetchJcpShares,
} from '@/lib/ceiling-data';
import {
  MAX_COMPARED,
  MIN_COMPARED,
  buildComparisonRow,
  type ComparisonRow,
} from '@/lib/comparison';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { AssetPicker } from '@/components/comparar/asset-picker';
import { ComparisonTable } from '@/components/comparar/comparison-table';
import { InvestmentSimulator } from '@/components/comparar/investment-simulator';

export const metadata = {
  title: 'Comparador de ativos',
};

interface ComparePageProps {
  searchParams: Promise<{ ativos?: string }>;
}

export default async function CompararPage({ searchParams }: ComparePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { ativos } = await searchParams;
  const requested = parseTickers(ativos);

  const [options, assets, overrideByTicker, jcpShares] = await Promise.all([
    fetchComparableOptions(supabase),
    fetchCeilingAssets(supabase, { tickers: requested }),
    fetchAppliedOverrides(supabase),
    fetchJcpShares(supabase, requested),
  ]);

  const assetByTicker = new Map(assets.map((asset) => [asset.ticker, asset]));

  // Percorre na ordem PEDIDA, não na que o banco devolveu: a usuária escolheu
  // uma sequência e as colunas têm que respeitar isso.
  const rows: ComparisonRow[] = requested.flatMap((ticker) => {
    const asset = assetByTicker.get(ticker);
    if (!asset) return [];
    return [
      buildComparisonRow({
        asset,
        override: overrideByTicker.get(ticker),
        jcpShare: jcpShares.get(ticker) ?? 0,
      }),
    ];
  });

  const missing = requested.filter((ticker) => !assetByTicker.has(ticker));

  return (
    <>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Comparador de ativos
          </h1>
          <p className="micro-hint">
            Até {MAX_COMPARED} ações ou fundos na mesma régua: preço teto,
            margem de segurança, rendimento líquido e P/VP.
          </p>
        </header>

        <AssetPicker options={options} selected={requested} />

        {missing.length > 0 && (
          <InfoNote title="Sem dados">
            {missing.join(', ')} {missing.length === 1 ? 'está' : 'estão'} no
            catálogo, mas ainda sem balanço ou rendimento gravado — sem isso não
            há teto nem rendimento para comparar.
          </InfoNote>
        )}

        {rows.length < MIN_COMPARED ? (
          <section className="card-lg">
            <h2 className="text-lg font-extrabold tracking-tight">
              Escolha os ativos
            </h2>
            <p className="mt-2 text-sm font-medium text-muted-foreground">
              A comparação começa com {MIN_COMPARED} ativos. Um número sozinho
              não diz se é alto ou baixo — é a coluna do lado que dá a régua.
            </p>
          </section>
        ) : (
          <>
            <ComparisonTable rows={rows} />
            <InvestmentSimulator rows={rows} />
          </>
        )}

        <InfoNote title="Aviso">
          A comparação organiza dados públicos e cálculos já exibidos em outras
          telas. Rendimento é histórico dos últimos 12 meses e não garante
          pagamento futuro; margem de segurança depende do preço teto, que muda
          com o balanço e com o ajuste aplicado. Nada aqui é recomendação de
          compra ou venda.
        </InfoNote>
      </main>
      <BottomNav />
    </>
  );
}

/**
 * `?ativos=PETR4,VALE3` vira a lista de tickers.
 *
 * Sanitiza porque o valor vem da URL, que qualquer um edita: formato de ticker,
 * sem repetição e cortado no limite. Sem o corte, `?ativos=` com cem códigos
 * viraria cem consultas de coluna numa tabela que cabe quatro.
 */
function parseTickers(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(',')
        .map((part) => part.trim().toUpperCase())
        .filter((part) => /^[A-Z][A-Z0-9]{3}\d{0,2}$/.test(part))
    ),
  ].slice(0, MAX_COMPARED);
}
