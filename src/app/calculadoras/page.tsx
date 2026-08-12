import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { CompoundCalculator } from '@/components/calculadoras/compound-calculator';
import { PassiveIncomeCalculator } from '@/components/calculadoras/passive-income-calculator';
import { FiiIncomeCalculator } from '@/components/calculadoras/fii-income-calculator';
import { StockIncomeCalculator } from '@/components/calculadoras/stock-income-calculator';
import { getCurrentCdiYearly } from '@/lib/bcb';
import { fetchFiiOptions, fetchStockOptions } from '@/lib/ceiling-data';

export default async function CalculadorasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // As calculadoras continuam sem gravar nada e sem chamar API externa; o que
  // muda é que a de FII já chega com o catálogo, em vez de pedir número.
  const [funds, stocks, cdiYearly] = await Promise.all([
    fetchFiiOptions(supabase),
    fetchStockOptions(supabase),
    // CDI ao vivo do Banco Central: a calculadora avulsa pede pra digitar.
    getCurrentCdiYearly(),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Calculadoras
          </h1>
          <p className="micro-hint">
            Simulações de rendimento. Os valores informados não são gravados.
          </p>
        </header>

        {/* Duas colunas a partir do desktop. Só alargar o container deixaria
            quatro cartões empilhados com os campos esticados no meio de muito
            branco — o que preenche a tela é pôr duas calculadoras lado a lado.
            `items-start` impede que a mais curta da linha estique até a altura
            da vizinha; elas têm alturas bem diferentes. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <CompoundCalculator />

          <PassiveIncomeCalculator />

          <StockIncomeCalculator stocks={stocks} cdiYearlyPercent={cdiYearly} />

          <FiiIncomeCalculator funds={funds} />
        </div>

        <InfoNote>
          As projeções assumem que as condições informadas se mantêm ao longo de
          todo o período, o que não ocorre no mercado. Servem para dimensionar
          cenários, não constituem garantia de retorno nem recomendação de
          investimento.
        </InfoNote>
      </main>
      <BottomNav />
    </>
  );
}
