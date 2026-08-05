import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import { getUpcomingDividends } from '@/lib/dividends';
import { BottomNav } from '@/components/layout/bottom-nav';
import { BecaTip } from '@/components/shared/beca-tip';
import { DividendsCard } from '@/components/resumo/dividends-card';
import { IncomeSummary } from '@/components/proventos/income-summary';
import { MonthlyIncomeChart } from '@/components/proventos/monthly-income-chart';
import { IncomeByTicker } from '@/components/proventos/income-by-ticker';
import { DividendRanking } from '@/components/proventos/dividend-ranking';
import { fetchTopPayers } from '@/lib/ceiling-data';
import type { PositionRow } from '@/types/portfolio';

export default async function ProventosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: rows } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: true });
  const positions = (rows ?? []) as PositionRow[];

  const [report, upcoming, topPayers] = await Promise.all([
    buildDividendIncomeReport(supabase, positions),
    getUpcomingDividends(supabase, positions),
    fetchTopPayers(supabase),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Teus proventos
          </h1>
          <p className="micro-hint">
            O dinheiro que teus ativos te pagam só por você ser dona deles.
          </p>
        </header>

        {positions.length === 0 ? (
          <BecaTip>
            Cadastra teus ativos na{' '}
            <Link href="/carteira" className="font-bold underline">
              Minha Carteira
            </Link>{' '}
            que eu vou atrás de tudo que eles já te pagaram — você não precisa
            anotar nada.
          </BecaTip>
        ) : (
          <>
            <IncomeSummary report={report} />

            <MonthlyIncomeChart monthly={report.monthly} />

            <IncomeByTicker byTicker={report.byTicker} />

            <DividendsCard dividends={upcoming} />

            <BecaTip title="Pra você entender">
              Provento é a tua parte do lucro, sem vender nada. Empresa costuma
              pagar de tempos em tempos; FII quase sempre paga todo mês. Quanto
              mais cotas você junta, maior fica o pingado — e ele nunca some do
              teu bolso quando o preço cai.
            </BecaTip>
          </>
        )}

        {/* Fica fora do bloco acima de propósito: quem ainda não cadastrou nada
            precisa de um motivo pra explorar, e o ranking é esse motivo. */}
        <DividendRanking
          stocks={topPayers.stocks}
          fiis={topPayers.fiis}
          excluded={topPayers.excluded}
        />
      </main>
      <BottomNav />
    </>
  );
}
