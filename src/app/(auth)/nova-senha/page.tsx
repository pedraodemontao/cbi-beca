import { NewPasswordForm } from '@/components/auth/new-password-form';

export const metadata = {
  title: 'Nova senha',
};

/**
 * Fim do fluxo de redefinição.
 *
 * Vive dentro de `(auth)` porque quem chega aqui vem do e-mail, com a marca no
 * topo e sem a barra de navegação — mas a rota NÃO é pública: o link do e-mail
 * passa antes por `/auth/confirm`, que estabelece a sessão. Sem sessão a action
 * recusa e explica que o link expirou.
 */
export default function NovaSenhaPage() {
  return <NewPasswordForm variant="reset" />;
}
