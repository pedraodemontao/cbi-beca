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
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.iso.date('Data inválida').optional()),
});

export type PositionFormData = z.infer<typeof positionFormSchema>;

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
  payoutPercent: z.coerce
    .number()
    .min(1, 'O payout precisa ser de pelo menos 1%')
    .max(200, 'O payout não pode exceder 200%'),
  expectedEps: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : Number(value)))
    .refine(
      (value) => value === undefined || (Number.isFinite(value) && value > 0),
      'O lucro por ação precisa ser maior que zero'
    ),
  /**
   * 'global' é o ajuste da Beca, que vale pra todas as usuárias. O padrão é
   * 'personal' porque o formulário só manda o campo pra quem é curadora — quem
   * não é nem vê a escolha, e a action confere de novo antes de gravar.
   */
  scope: z.enum(['personal', 'global']).default('personal'),
});

export type CeilingOverrideFormData = z.infer<typeof ceilingOverrideSchema>;
