import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BecaTip } from '@/components/shared/beca-tip';
import { CompoundCalculator } from '@/components/calculadoras/compound-calculator';
import { PassiveIncomeCalculator } from '@/components/calculadoras/passive-income-calculator';

export default async function CalculadorasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Calculadoras
          </h1>
          <p className="micro-hint">
            Brinca com os números e vê o que acontece. Nada aqui é registrado —
            é só pra você entender.
          </p>
        </header>

        <CompoundCalculator />

        <PassiveIncomeCalculator />

        <BecaTip>
          Simulação não é previsão, combinado? O mercado sobe e desce. Isso aqui
          serve pra te dar noção de grandeza e te ajudar a planejar — não é
          garantia de retorno nem recomendação de investimento.
        </BecaTip>
      </main>
      <BottomNav />
    </>
  );
}
