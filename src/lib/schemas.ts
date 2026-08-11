import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, 'Informe o nome'),
  email: z.email('E-mail inválido'),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;

export const positionFormSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,10}$/, 'Ticker inválido'),
  assetType: z.enum(['stock', 'fii'], { error: 'Selecione o tipo de ativo' }),
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
