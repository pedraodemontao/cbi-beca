'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/preco-teto', label: 'Teto', icon: TagIcon },
  { href: '/carteira', label: 'Carteira', icon: WalletIcon },
  { href: '/proventos', label: 'Proventos', icon: CoinsIcon },
  { href: '/resumo', label: 'Resumo', icon: ChartIcon },
  { href: '/calculadoras', label: 'Contas', icon: CalculatorIcon },
  { href: '/chat', label: 'Chat', icon: ChatIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur sm:static sm:mx-auto sm:mt-6 sm:w-full sm:max-w-3xl sm:rounded-full sm:border sm:bg-surface sm:shadow-soft"
    >
      {/* O respiro de baixo acompanha o home indicator do iPhone; em aparelho
          sem entalhe `env()` devolve 0 e nada muda. */}
      <ul
        className="mx-auto flex max-w-3xl items-center justify-around px-2 py-2 sm:justify-center sm:gap-2 sm:py-1.5 sm:pb-1.5"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 sm:flex-none">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-1.5 py-2 text-[0.65rem] font-bold transition-colors sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm ${
                  isActive
                    ? 'bg-primary-wash text-primary-deep'
                    : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <Icon />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const iconProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function TagIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M20.6 13.4 12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <path d="M7.5 7.5h.01" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M16 12h2" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" />
    </svg>
  );
}

function CoinsIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  );
}

function CalculatorIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}
