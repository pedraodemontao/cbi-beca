import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { fetchCeilingAssets, fetchAppliedOverrides } from '@/lib/ceiling-data';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BecaTip } from '@/components/shared/beca-tip';
import { CeilingTable } from '@/components/preco-teto/ceiling-table';
import type { PositionRow } from '@/types/portfolio';

/**
 * Ações e FIIs dividem esse teto, e o catálogo elegível inteiro cabe nele (~690).
 * Com um número menor a ordenação por valor de mercado gastava as vagas todas
 * em ação e a aba de FII chegava quase vazia.
 */
const UNIVERSE_SIZE = 900;

export default async function PrecoTetoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [assets, overrides, { data: positionRows }] = await Promise.all([
    fetchCeilingAssets(supabase, { limit: UNIVERSE_SIZE }),
    fetchAppliedOverrides(supabase),
    supabase.from('positions').select('ticker'),
  ]);

  const ownedTickers = [
    ...new Set(((positionRows ?? []) as Pick<PositionRow, 'ticker'>[]).map((p) => p.ticker)),
  ];

  return (
    <>
      {/*
        Mais larga que as outras telas de propósito: a tabela tem dez colunas e
        num container de 5xl a margem de segurança — que é a coluna que decide
        tudo — ficava escondida no scroll horizontal.
      */}
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Preço teto
          </h1>
          <p className="micro-hint">
            Até quanto vale a pena pagar numa ação pra ela te pagar o dividendo
            que você quer.
          </p>
        </header>

        {assets.length === 0 ? (
          <BecaTip>
            Ainda não carreguei os números das empresas aqui. Assim que a
            sincronização do mercado rodar, essa tabela aparece inteirinha —
            volta daqui a pouco.
          </BecaTip>
        ) : (
          <CeilingTable
            assets={assets}
            overrides={[...overrides.values()]}
            ownedTickers={ownedTickers}
          />
        )}
      </main>
      <BottomNav />
    </>
  );
}
