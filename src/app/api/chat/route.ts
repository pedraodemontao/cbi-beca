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
import { fetchCeilingAssets, fetchAppliedOverrides } from '@/lib/ceiling-data';
import {
  bazinCeiling,
  buildCeilingProjection,
  safetyMargin,
  DEFAULT_PAYOUT,
} from '@/lib/ceiling-price';
import type { AppliedOverride, CeilingAsset } from '@/types/ceiling';
import type {
  AssetType,
  DividendIncomeReport,
  PortfolioSummary,
  PositionRow,
  UpcomingDividend,
} from '@/types/portfolio';

const CHAT_MODEL = 'claude-sonnet-5';

/**
 * O cliente só manda `user` e `assistant`.
 *
 * `system` estava na lista e o corpo vem do navegador: uma requisição com
 * `{"role":"system"}` injetava instrução com o mesmo peso do `prompts/system.md`
 * — e DEPOIS dele, o que sobrescreveria as regras de nunca recomendar compra e
 * venda e de nunca inventar número. O SDK aceita esse papel sem reclamar
 * (`convertToModelMessages` tem `case 'system'`), então quem tem que barrar é
 * este schema.
 */
const bodySchema = z.object({
  messages: z
    .array(z.looseObject({ role: z.enum(['user', 'assistant']) }))
    .min(1)
    .max(60),
});

/**
 * Teto de perguntas por hora, por conta.
 *
 * Cada pergunta remonta a carteira inteira mais o preço teto do catálogo no
 * prompt, e o histórico volta junto a cada turno — sem limite, uma conta grátis
 * (o cadastro é aberto) consegue consumir a chave da Anthropic em laço. A
 * contagem sai do próprio histórico gravado: não exige infraestrutura nova.
 */
const MAX_QUESTIONS_PER_HOUR = 40;

/** Pergunta acima disso não é uso legítimo — é tentativa de inflar o prompt. */
const MAX_QUESTION_CHARS = 4000;

/** Sem teto, uma resposta longa consome tokens sem limite e pode ser cortada. */
const MAX_OUTPUT_TOKENS = 1500;

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
    `- Total recebido desde as compras (líquido de IR): ${formatBRL(income.netReceived)}`,
    `- Total bruto distribuído: ${formatBRL(income.totalReceived)}${
      income.taxWithheld > 0 ? ` (IR retido sobre JCP: ${formatBRL(income.taxWithheld)})` : ''
    }`,
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

/**
 * Preço teto dos ativos que a usuária tem.
 *
 * Vai num bloco separado porque responde outra pergunta: o CONTEXTO_CARTEIRA
 * diz quanto ela tem, este diz se o preço de hoje ainda faz sentido. A regra de
 * nunca recomendar compra ou venda continua valendo — o teto é referência de
 * estudo, e a IA só pode repetir o número que já veio pronto.
 */
function buildCeilingContext(
  assets: CeilingAsset[],
  overrides: Map<string, AppliedOverride>,
  quoteMap: Map<string, BrapiQuote>
): string {
  if (assets.length === 0) return '';

  const lines: string[] = [
    '<CONTEXTO_PRECO_TETO>',
    'Preço teto é até quanto vale a pena pagar num ativo pra que o dividendo dele renda o percentual desejado ao ano. Os números abaixo já estão calculados.',
    '',
  ];

  for (const asset of assets) {
    const override = overrides.get(asset.ticker);
    const price = quoteMap.get(asset.ticker)?.regularMarketPrice ?? asset.price;

    if (asset.assetType === 'fii') {
      const ceiling = bazinCeiling(asset.dividends12m, 0.06);
      if (ceiling === null) continue;
      lines.push(
        `- ${asset.ticker} (FII): rendeu ${formatBRL(asset.dividends12m!)} por cota em 12 meses; teto pra render 6% ao ano = ${formatBRL(ceiling)}${
          price === null ? '' : `; cotação atual ${formatBRL(price)}`
        }`
      );
      continue;
    }

    const projection = buildCeilingProjection({
      price,
      reportedProfit: asset.netIncome,
      manualProfit: override?.manualProfit ?? null,
      sharesOutstanding: asset.sharesOutstanding,
      bookValuePerShare: asset.vpa,
      payout: override?.payout ?? DEFAULT_PAYOUT,
    });

    const ceiling = projection.ceilings[0]?.ceiling;
    if (ceiling === null || ceiling === undefined) continue;

    const margin = safetyMargin(ceiling, price);
    lines.push(
      `- ${asset.ticker}: lucro por ação ${formatBRL(projection.eps!)}, dividendo previsto ${formatBRL(
        projection.dps!
      )} (payout de ${Math.round(projection.payout * 100)}%); teto pra render 6% ao ano = ${formatBRL(ceiling)}${
        projection.graham === null ? '' : `; valor justo de Graham = ${formatBRL(projection.graham)}`
      }${
        margin === null
          ? ''
          : margin >= 0
            ? `; margem de segurança de ${formatPercent(margin * 100)} — ou seja, a cotação de hoje está esse tanto ABAIXO do teto`
            : `; SEM margem de segurança: a cotação está ACIMA do teto`
      }${
        // O ajuste global vale pra todo mundo: dizer "a usuária ajustou" seria
        // falso pra quem nunca mexeu em nada, e o assistente repetiria isso.
        override
          ? override.isGlobal
            ? ' — o payout ou o lucro desta empresa foi ajustado pela curadoria da plataforma e vale para todas as contas'
            : ' — o usuário ajustou o payout ou o lucro desta empresa'
          : ''
      }`
    );
  }

  if (lines.length === 3) return '';

  lines.push(
    '',
    'Margem de segurança é o desconto da cotação sobre o TETO — com 47% de margem, a ação custa 47% menos que o teto. Use o número como está aqui, não recalcule.',
    'O lucro vem do último balanço publicado na CVM e pode não se repetir. Preço teto é referência de estudo, NUNCA recomendação: não diga pra comprar, vender ou esperar.',
    '</CONTEXTO_PRECO_TETO>'
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
      { error: 'Assistente indisponível no momento. Tente novamente em instantes.' },
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

  // `looseObject` não olha dentro de `parts`: sem este teto, uma pergunta de
  // megabytes entra inteira no prompt.
  const questionText = lastUserText(messages);
  if (questionText !== null && questionText.length > MAX_QUESTION_CHARS) {
    return NextResponse.json(
      { error: 'Pergunta muito longa. Reduza o texto e tente novamente.' },
      { status: 400 }
    );
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recentQuestions } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'user')
    .gte('created_at', oneHourAgo);

  if ((recentQuestions ?? 0) >= MAX_QUESTIONS_PER_HOUR) {
    return NextResponse.json(
      { error: 'Limite de perguntas por hora atingido. Tente novamente mais tarde.' },
      { status: 429 }
    );
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
  const [quotes, upcomingDividends, income, ceilingAssets, ceilingOverrides] =
    await Promise.all([
      tickers.length > 0 ? getQuote(tickers) : Promise.resolve<BrapiQuote[]>([]),
      getUpcomingDividends(supabase, positions),
      buildDividendIncomeReport(supabase, positions),
      fetchCeilingAssets(supabase, { tickers }),
      fetchAppliedOverrides(supabase),
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

  const ceilingBlock = buildCeilingContext(ceilingAssets, ceilingOverrides, quoteMap);

  // A pergunta é gravada antes de responder: se a resposta falhar no meio, a
  // usuária pelo menos reencontra o que perguntou.
  const question = questionText;
  if (question) {
    await supabase
      .from('chat_messages')
      .insert({ user_id: user.id, role: 'user', content: question });
  }

  const result = streamText({
    model: anthropic(CHAT_MODEL),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    system: [systemPrompt, contextBlock, ceilingBlock].filter(Boolean).join('\n\n'),
    messages: await convertToModelMessages(messages),
    async onFinish({ text }) {
      if (!text.trim()) return;
      // Só a conversa vai pro banco. O prompt de sistema carrega a carteira
      // inteira dela e é remontado a cada pergunta — gravar seria guardar um
      // retrato financeiro desatualizado sem motivo.
      await supabase
        .from('chat_messages')
        .insert({ user_id: user.id, role: 'assistant', content: text });
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}

/** Texto da última pergunta. As partes da mensagem podem vir fatiadas. */
function lastUserText(messages: { role: string; parts?: unknown[] }[]): string | null {
  const last = [...messages].reverse().find((message) => message.role === 'user');
  if (!last) return null;

  const text = (last.parts ?? [])
    .flatMap((part) =>
      part && typeof part === 'object' && 'text' in part && typeof part.text === 'string'
        ? [part.text]
        : []
    )
    .join('')
    .trim();
  return text || null;
}
