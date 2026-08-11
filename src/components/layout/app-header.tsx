import { signOut } from '@/app/(auth)/actions';

interface AppHeaderProps {
  greeting: string;
  subtitle: string;
}

export function AppHeader({ greeting, subtitle }: AppHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      {/* `min-w-0` + `break-words`: nome comprido tem que quebrar dentro da
          coluna, não empurrar o botão Sair pra fora da tela. */}
      <div className="min-w-0">
        <h1 className="text-[clamp(1.9rem,6.5vw,2.4rem)] font-extrabold leading-tight tracking-tight break-words">
          {greeting}
        </h1>
        <p className="mt-1 text-[1.05rem] font-medium text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <form action={signOut}>
        <button type="submit" className="btn-ghost mt-1 flex-none">
          Sair
        </button>
      </form>
    </header>
  );
}
