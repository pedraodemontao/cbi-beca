import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

/*
 * Não há schema de cadastro: a plataforma não tem cadastro aberto. Nome e
 * e-mail da aluna entram pelo admin API, e a senha provisória é gerada, nunca
 * digitada — ver `scripts/criar-alunos.mjs`.
 */

export const passwordResetRequestSchema = z.object({
  email: z.email('E-mail inválido'),
});

/**
 * Nova senha, com confirmação.
 *
 * O mínimo de 8 é o mesmo do cadastro E o mesmo que o Supabase passou a exigir
 * em 2026-08-13 (`password_min_length`, que estava em 6). Os dois lados
 * precisam concordar: com o banco em 6 e o formulário em 8, uma senha aceita
 * pelo painel era recusada aqui sem explicação.
 */
export const newPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres'),
    passwordConfirmation: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: 'As senhas não são iguais',
    path: ['passwordConfirmation'],
  });

export type LoginFormData = z.infer<typeof loginSchema>;
export type NewPasswordFormData = z.infer<typeof newPasswordSchema>;

/**
 * Campo numérico OPCIONAL vindo de formulário.
 *
 * `z.string()` recebendo `undefined` estoura com "expected string, received
 * undefined" — em inglês, e na cara da usuária. E `undefined` é exatamente o
 * que chega quando o campo NÃO É RENDERIZADO: os formulários de preço teto e
 * de renda fixa trocam de campo conforme o tipo do ativo, então metade das
 * chaves simplesmente não existe no `FormData`.
 *
 * `.optional()` antes do transform é o que faz a chave ausente virar
 * `undefined` em silêncio, em vez de erro.
 */
function optionalNumber(message: string, check: (value: number) => boolean) {
  return z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || (Number.isFinite(value) && check(value)),
      message
    );
}

export const positionFormSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,10}$/, 'Ticker inválido'),
  assetType: z.enum(['stock', 'fii', 'bdr', 'etf'], {
    error: 'Selecione o tipo de ativo',
  }),
  quantity: z.coerce.number().positive('A quantidade deve ser maior que zero'),
  avgPrice: z.coerce.number().positive('O preço médio deve ser maior que zero'),
  purchaseDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))
    .pipe(z.iso.date('Data inválida').optional()),
});

export type PositionFormData = z.infer<typeof positionFormSchema>;

/**
 * Renda fixa. Não tem ticker nem quantidade — tem emissor, taxa, indexador e
 * vencimento, e o rendimento é CALCULADO, nunca digitado.
 *
 * O `superRefine` no fim é o espelho da constraint
 * `fixed_income_rate_matches_index` do banco: o indexador decide qual taxa é
 * obrigatória. Existir nos dois lados é de propósito — o banco é quem
 * protege, e o Zod é quem devolve português em vez de erro do Postgres.
 */
export const fixedIncomeFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Dê um nome para reconhecer depois')
      .max(80, 'Nome muito longo'),
    kind: z.enum(['cdb', 'lci', 'lca', 'cri', 'cra', 'debenture', 'poupanca'], {
      error: 'Selecione o tipo',
    }),
    principal: z.coerce
      .number()
      .positive('O valor aplicado deve ser maior que zero'),
    appliedOn: z.iso.date('Data de aplicação inválida'),
    maturesOn: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value === undefined || value === '' ? undefined : value))
      .pipe(z.iso.date('Data de vencimento inválida').optional()),
    indexKind: z.enum(['cdi', 'prefixado'], { error: 'Selecione o indexador' }),
    indexPercent: optionalNumber(
      'O percentual do CDI precisa ficar entre 0 e 500',
      (value) => value > 0 && value <= 500
    ),
    ratePercent: optionalNumber(
      'A taxa precisa ficar entre 0 e 100% ao ano',
      (value) => value > 0 && value <= 100
    ),
  })
  .superRefine((data, ctx) => {
    if (data.indexKind === 'cdi' && data.indexPercent === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['indexPercent'],
        message: 'Informe o percentual do CDI (ex.: 110)',
      });
    }
    if (data.indexKind === 'prefixado' && data.ratePercent === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['ratePercent'],
        message: 'Informe a taxa anual (ex.: 12,5)',
      });
    }
    if (data.maturesOn && data.maturesOn <= data.appliedOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['maturesOn'],
        message: 'O vencimento precisa ser depois da aplicação',
      });
    }
  });

export type FixedIncomeFormData = z.infer<typeof fixedIncomeFormSchema>;

/**
 * Ajuste de preço teto por empresa.
 *
 * O lucro entra como lucro POR AÇÃO: ninguém digita "107583000000" pra dizer
 * quanto a Petrobras lucrou. A action multiplica pela quantidade de ações do
 * banco antes de gravar em `manual_profit`.
 */
export const ceilingOverrideSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,10}$/, 'Ticker inválido'),
  /**
   * Opcional porque fundo não tem payout: o teto dele sai da distribuição
   * paga, não de uma parcela do lucro. O formulário de fundo não manda este
   * campo, e a action recusa se ele vier junto com o de distribuição.
   */
  payoutPercent: optionalNumber(
    'O payout precisa ficar entre 1% e 200%',
    (value) => value >= 1 && value <= 200
  ),
  expectedEps: optionalNumber(
    'O lucro por ação precisa ser maior que zero',
    (value) => value > 0
  ),
  /**
   * Distribuição MENSAL por cota, em reais — é como o mercado de fundo fala e
   * é o que a Beca pediu. A action multiplica por doze antes de gravar,
   * porque o banco e o cálculo do teto trabalham no anual.
   */
  monthlyDistribution: optionalNumber(
    'A distribuição mensal precisa ser maior que zero',
    (value) => value > 0
  ),
  /**
   * 'global' é o ajuste da Beca, que vale pra todas as usuárias. O padrão é
   * 'personal' porque o formulário só manda o campo pra quem é curadora — quem
   * não é nem vê a escolha, e a action confere de novo antes de gravar.
   */
  scope: z.enum(['personal', 'global']).default('personal'),
});

export type CeilingOverrideFormData = z.infer<typeof ceilingOverrideSchema>;
