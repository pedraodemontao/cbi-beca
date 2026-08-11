import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import { buildDividendCalendar } from '@/lib/dividends';
import { BottomNav } from '@/components/layout/bottom-nav';
import { InfoNote } from '@/components/shared/info-note';
import { DividendCalendar } from '@/components/proventos/dividend-calendar';
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

  const [report, calendar, topPayers] = await Promise.all([
    buildDividendIncomeReport(supabase, positions),
    buildDividendCalendar(supabase, positions),
    fetchTopPayers(supabase),
  ]);

  return (
    <>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 pb-28 pt-8 sm:pb-8">
        <header>
          <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold tracking-tight">
            Proventos
          </h1>
          <p className="micro-hint">
            Dividendos e juros sobre capital próprio pagos pelos ativos em
            carteira.
          </p>
        </header>

        {positions.length === 0 ? (
          <InfoNote>
            Cadastre seus ativos em{' '}
            <Link href="/carteira" className="font-bold underline">
              Carteira
            </Link>{' '}
            para que a plataforma calcule os proventos recebidos. O lançamento é
            automático, a partir da data de compra.
          </InfoNote>
        ) : (
          <>
            <IncomeSummary report={report} />

            <MonthlyIncomeChart monthly={report.monthly} />

            <IncomeByTicker byTicker={report.byTicker} />

            <DividendCalendar months={calendar} />

            <InfoNote title="Como funciona">
              Provento é a parcela do lucro distribuída aos acionistas e
              cotistas, sem necessidade de vender o ativo. Ações costumam
              distribuir em intervalos irregulares; fundos imobiliários, em
              geral mensalmente. O valor recebido é proporcional à quantidade
              em carteira na data-com e independe da variação de preço.
            </InfoNote>
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
