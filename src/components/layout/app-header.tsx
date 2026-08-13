import Link from 'next/link';
import { signOut } from '@/app/(auth)/actions';

interface AppHeaderProps {
  title: string;
  subtitle: string;
}

export function AppHeader({ title, subtitle }: AppHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      {/* `min-w-0` + `break-words`: título comprido tem que quebrar dentro da
          coluna, não empurrar o botão Sair pra fora da tela. */}
      <div className="min-w-0">
        <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold leading-tight tracking-tight break-words">
          {title}
        </h1>
        <p className="mt-1 text-[1.05rem] font-medium text-muted-foreground">
          {subtitle}
        </p>
      </div>
      {/* "Conta" mora ao lado de "Sair" porque é o único caminho para trocar a
          senha provisória do primeiro acesso, e ele não pode depender de a
          aluna adivinhar a URL. */}
      <div className="mt-1 flex flex-none items-center gap-2">
        <Link href="/conta" className="btn-ghost">
          Conta
        </Link>
        <form action={signOut}>
          <button type="submit" className="btn-ghost">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
