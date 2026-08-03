import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { anthropic } from '@ai-sdk/anthropic';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getQuote, type BrapiQuote } from '@/lib/brapi';
import { getUpcomingDividends } from '@/lib/dividends';
import { formatBRL, formatPercent, formatQuantity } from '@/lib/format';
import { buildPortfolioSummary } from '@/lib/portfolio';
import { createClient } from '@/lib/supabase/server';
import { buildDividendIncomeReport } from '@/lib/dividend-income';
import type {
  AssetType,
  DividendIncomeReport,
  PortfolioSummary,
  PositionRow,
  UpcomingDividend,
} from '@/types/portfolio';

const CHAT_MODEL = 'claude-sonnet-5';

const bodySchema = z.object({
  messages: z
    .array(z.looseObject({ role: z.enum(['user', 'assistant', 'system']) }))
    .min(1)
    .max(100),
});

const ASSET_TYPE_LABEL: Record<AssetType, string> = { stock: 'Ação', fii: 'FII' };

const rateFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

function buildPortfolioContext(
  summary: PortfolioSummary,
  upcomingDividends: UpcomingDividend[],
  areQuotesUnavailable: boolean,
  income: DividendIncomeReport
): string {
  const lines: string[] = ['<CONTEXTO_CARTEIRA>'];

  if (summary.totalPositionsCount === 0) {
    lines.push(
      'O usuário ainda não cadastrou nenhuma posição na carteira.',
      'Não há números para citar. Convide com leveza a cadastrar o primeiro ativo na página Minha Carteira.'
    );
    lines.push('</CONTEXTO_CARTEIRA>');
    return lines.join('\n');
  }

  if (areQuotesUnavailable) {
    lines.push(
      'ATENÇÃO: as cotações de mercado estão indisponíveis neste momento. Patrimônio atual, lucro e composição não puderam ser calculados — diga isso ao usuário se ele perguntar por esses números.'
    );
  } else if (summary.hasMissingQuotes) {
    lines.push(
      `ATENÇÃO: cobertura parcial de cotações (${summary.pricedPositionsCount} de ${summary.totalPositionsCount} posições com preço). Os totais abaixo consideram apenas as posições com cotação disponível.`
    );
  }

  if (summary.pricedPositionsCount > 0) {
    lines.push(
      '',
      'RESUMO (valores já calculados):',
      `- Patrimônio atual: ${formatBRL(summary.totalValue)}`,
      `- Total investido: ${formatBRL(summary.investedValue)}`,
      `- Resultado: ${formatBRL(summary.profit)}${
        summary.profitPercent === null ? '' : ` (${formatPercent(summary.profitPercent)})`
      }`
    );

    if (summary.allocation.length > 0) {
      lines.push('', 'COMPOSIÇÃO POR TIPO DE ATIVO:');
      for (const slice of summary.allocation) {
        lines.push(
          `- ${ASSET_TYPE_LABEL[slice.assetType]}: ${formatBRL(slice.value)} (${formatPercent(
            slice.percentage
          )} da carteira)`
        );
      }
    }
  }

  lines.push('', 'POSIÇÕES:');
  for (const position of summary.positions) {
    const base = `- ${position.ticker} (${ASSET_TYPE_LABEL[position.assetType]}): ${formatQuantity(
      position.quantity
    )} cotas/ações, preço médio ${formatBRL(position.avgPrice)}, investido ${formatBRL(
      position.investedValue
    )}`;
    if (
      position.currentPrice === null ||
      position.currentValue === null ||
      position.profit === null
    ) {
      lines.push(`${base} — cotação indisponível no momento`);
      continue;
    }
    lines.push(
      `${base}, cotação atual ${formatBRL(position.currentPrice)}, valor atual ${formatBRL(
        position.currentValue
      )}, resultado ${formatBRL(position.profit)}${
        position.profitPercent === null ? '' : ` (${formatPercent(position.profitPercent)})`
      }`
    );
  }

  lines.push(
    '',
    'PROVENTOS JÁ RECEBIDOS (calculados a partir do histórico de pagamentos e da quantidade que ele tem):',
    `- Total recebido desde as compras: ${formatBRL(income.totalReceived)}`,
    `- Média mensal recebida: ${formatBRL(income.monthlyAverage)}`,
    `- Renda mensal estimada da carteira atual: ${formatBRL(income.estimatedMonthlyIncome)}`
  );
  if (income.byTicker.length > 0) {
    lines.push('- Por ativo:');
    for (const entry of income.byTicker) {
      lines.push(
        `  · ${entry.ticker}: ${formatBRL(entry.total)} em ${entry.payments} pagamento(s)`
      );
    }
  }
  if (income.hasMissingPurchaseDates) {
    lines.push(
      '- ATENÇÃO: há posições sem data de compra informada; o total recebido pode estar subestimado. Se for relevante, sugira preencher a data de compra na página Minha Carteira.'
    );
  }

  lines.push('', 'PRÓXIMOS PROVENTOS ANUNCIADOS:');
  if (upcomingDividends.length === 0) {
    lines.push('- Nenhum provento futuro encontrado para os ativos da carteira.');
  } else {
    for (const dividend of upcomingDividends) {
      const parts = [
        `- ${dividend.ticker}`,
        dividend.label ? `(${dividend.label})` : null,
        dividend.rate === null ? null : `${rateFormatter.format(dividend.rate)} por cota/ação`,
        `pagamento em ${dateFormatter.format(new Date(dividend.paymentDate))}`,
      ].filter(Boolean);
      lines.push(parts.join(' — '));
    }
  }

  lines.push(
    '',
    'Todos os valores acima já vieram calculados pelo sistema. Use-os exatamente como estão — nunca recalcule, some ou estime números.',
    '</CONTEXTO_CARTEIRA>'
  );
  return lines.join('\n');
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Chat indisponível no momento. Tenta de novo daqui a pouco, beleza?' },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Formato de mensagens inválido.' }, { status: 400 });
  }

  let messages;
  try {
    messages = await validateUIMessages({ messages: parsed.data.messages });
  } catch {
    return NextResponse.json({ error: 'Formato de mensagens inválido.' }, { status: 400 });
  }

  const systemPrompt = await readFile(
    path.join(process.cwd(), 'prompts', 'system.md'),
    'utf-8'
  );

  const { data: rows } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: true });
  const positions = (rows ?? []) as PositionRow[];

  const tickers = [...new Set(positions.map((position) => position.ticker))];
  const [quotes, upcomingDividends, income] = await Promise.all([
    tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
    getUpcomingDividends(positions),
    buildDividendIncomeReport(positions),
  ]);
  const quoteMap = new Map<string, BrapiQuote>((quotes ?? []).map((quote) => [quote.symbol, quote]));
  const areQuotesUnavailable = tickers.length > 0 && quotes === null;

  const summary = buildPortfolioSummary(positions, quoteMap);
  const contextBlock = buildPortfolioContext(
    summary,
    upcomingDividends,
    areQuotesUnavailable,
    income
  );

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    system: `${systemPrompt}\n\n${contextBlock}`,
    messages: await convertToModelMessages(messages),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
