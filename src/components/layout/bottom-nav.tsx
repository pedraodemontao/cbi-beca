'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * `short` é o rótulo do celular.
 *
 * Com oito destinos sobram ~45px por item a 375px, e "Carteira" e "Proventos"
 * não cabem em uma linha nessa largura — um único rótulo quebrando em duas
 * linhas desalinha a barra inteira. É também por isso que "Radar" entrou com o
 * nome curto que já tinha: qualquer coisa maior estouraria os dois lados.
 *
 * No desktop os rótulos também são curtos, e isso é requisito e não estilo:
 * a pill bar cresce com o conteúdo, então "Preço Teto" e "Calculadoras"
 * empurravam a largura além da tela e faziam o "Chat" vazar pra fora da
 * cápsula. "Teto" e "Contas" já eram as abreviações usadas antes de a aba de
 * notícias existir.
 */
const ITEMS = [
  { href: '/preco-teto', label: 'Teto', short: 'Teto', icon: TagIcon },
  { href: '/carteira', label: 'Carteira', short: 'Ativos', icon: WalletIcon },
  { href: '/proventos', label: 'Proventos', short: 'Renda', icon: CoinsIcon },
  { href: '/resumo', label: 'Resumo', short: 'Resumo', icon: ChartIcon },
  { href: '/radar', label: 'Radar', short: 'Radar', icon: RadarIcon },
  { href: '/noticias', label: 'Notícias', short: 'Notícias', icon: NewsIcon },
  { href: '/calculadoras', label: 'Contas', short: 'Contas', icon: CalculatorIcon },
  { href: '/chat', label: 'Chat', short: 'Chat', icon: ChatIcon },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    // Fixa em toda largura de tela. No desktop ela era `static` e ia embora no
    // scroll — navegar exigia rolar até o fim da página. Aqui o `nav` é só a
    // faixa fixa; quem desenha a cápsula é o `ul`, e a pílula tem a largura do
    // conteúdo (`w-fit`) em vez de um `max-w` fixo.
    //
    // A troca pra cápsula acontece em `lg` (1024px) e não em `sm` (640px), e a
    // razão é medida: com os rótulos longos a pílula precisa de ~825px, então
    // entre 640 e 880px ela estourava o `max-w-[calc(100vw-2rem)]` e os últimos
    // destinos ficavam pra fora do arredondado. Isso já acontecia com sete
    // destinos a partir de 640px — o iPad em retrato (768px) pegava o defeito
    // em cheio. A barra de baixo, que distribui os itens em `justify-around`,
    // aguenta oito rótulos até a 375px, então ela é quem cobre a faixa do meio.
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur lg:bottom-5 lg:border-none lg:bg-transparent lg:backdrop-blur-none"
    >
      {/* O respiro de baixo acompanha o home indicator do iPhone; em aparelho
          sem entalhe `env()` devolve 0 e nada muda. */}
      <ul
        className="mx-auto flex max-w-3xl items-center justify-around px-2 py-2 lg:w-fit lg:max-w-[calc(100vw-2rem)] lg:justify-center lg:gap-1 lg:rounded-full lg:border lg:border-border lg:bg-surface/95 lg:py-2 lg:shadow-soft lg:backdrop-blur"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {ITEMS.map(({ href, label, short, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1 lg:flex-none">
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={label}
                className={`flex flex-col items-center gap-0.5 rounded-2xl px-0.5 py-2 text-[0.62rem] font-bold transition-colors lg:flex-row lg:gap-2 lg:rounded-full lg:px-3.5 lg:text-sm ${
                  isActive
                    ? 'bg-primary-wash text-primary-deep'
                    : 'text-muted-foreground hover:text-primary'
                }`}
              >
                <Icon />
                <span className="lg:hidden">{short}</span>
                <span className="hidden lg:inline">{label}</span>
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

function RadarIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M12 4a8 8 0 1 0 8 8" />
      <path d="M12 8a4 4 0 1 0 4 4" />
      <path d="M12 12 20 4" />
    </svg>
  );
}

function NewsIcon() {
  return (
    <svg {...iconProps} aria-hidden>
      <path d="M4 5h13a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H5a2 2 0 0 1-2-2V6a1 1 0 0 1 1-1z" />
      <path d="M18 8h2a1 1 0 0 1 1 1v9" />
      <path d="M7 9h7M7 13h7M7 17h4" />
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
