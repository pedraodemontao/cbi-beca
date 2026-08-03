import { z } from 'zod';

export const loginSchema = z.object({
  email: z.email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const signupSchema = z.object({
  displayName: z.string().trim().min(2, 'Diz aí como a gente te chama'),
  email: z.email('E-mail inválido'),
  password: z.string().min(6, 'Senha precisa de pelo menos 6 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignupFormData = z.infer<typeof signupSchema>;

export const positionFormSchema = z.object({
  ticker: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{4,10}$/, 'Ticker inválido'),
  assetType: z.enum(['stock', 'fii'], { error: 'Escolha ação ou FII' }),
  quantity: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  avgPrice: z.coerce.number().positive('Preço médio deve ser maior que zero'),
  purchaseDate: z
    .string()
    .trim()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.iso.date('Data inválida').optional()),
});

export type PositionFormData = z.infer<typeof positionFormSchema>;
