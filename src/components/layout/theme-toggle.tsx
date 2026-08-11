'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { THEME_COLOR, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

/** Preferência salva, ou null quando a pessoa nunca escolheu. */
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;

  // As metas que o Next emite vêm com `media` de claro e escuro, pra cobrir
  // quem nunca escolheu. A partir do momento em que existe tema aplicado, o
  // `media` é justamente o que atrapalha: a hidratação reinsere as metas e
  // sobra uma escura casando com o aparelho, deixando a barra do navegador
  // preta num app claro. Tirar o `media` e igualar o `content` faz qualquer
  // duplicata dizer a mesma coisa.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.removeAttribute('media');
    meta.setAttribute('content', THEME_COLOR[theme]);
  }
}

/**
 * Troca entre claro e escuro.
 *
 * Sem estado React de propósito: o componente lê e escreve direto no `<html>`.
 * Guardar o tema em `useState` obrigaria o servidor a adivinhar qual é, e ele
 * não tem como — o primeiro render sairia errado e piscaria na hidratação.
 * Quem decide o que aparece é o CSS (`.theme-icon-to-*` em `globals.css`).
 */
export function ThemeToggle() {
  /**
   * Espelha o aparelho em `data-theme` enquanto não houver escolha salva.
   *
   * O CSS sozinho já acerta no primeiro paint (`color-scheme: light dark` +
   * `light-dark()`), mas com uma ressalva medida no Chrome: `light-dark()`
   * dentro de custom property herdada é resolvido UMA vez no `:root` e não
   * recalcula quando só o `color-scheme` muda — quem troca o tema do celular
   * às 18h com o app aberto ficaria na cor antiga até um recarregamento duro
   * (navegar pelo app não basta, o App Router não repinta o CSS). Mudança de
   * ATRIBUTO recalcula, então é por ela que a troca sempre passa.
   */
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const fromDevice = (): Theme => (media.matches ? 'dark' : 'light');

    // No mount (e a cada rota, porque a navegação client-side reinsere as
    // metas) reafirma o tema em vigor; a preferência do aparelho só entra
    // quando não há escolha salva.
    apply(savedTheme() ?? fromDevice());

    const onDeviceChange = () => {
      if (savedTheme()) return;
      apply(fromDevice());
    };
    media.addEventListener('change', onDeviceChange);
    return () => media.removeEventListener('change', onDeviceChange);
  }, [pathname]);

  function toggle() {
    const root = document.documentElement;
    // Sem escolha salva o tema é o do aparelho — é dele que a troca parte.
    const current =
      root.dataset.theme === 'light' || root.dataset.theme === 'dark'
        ? root.dataset.theme
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    const next: Theme = current === 'dark' ? 'light' : 'dark';

    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Navegação privada bloqueia o storage. A troca vale pra sessão.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar entre tema claro e escuro"
      className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-surface text-muted-foreground transition-colors hover:border-primary hover:text-primary"
    >
      <SunIcon />
      <MoonIcon />
    </button>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function SunIcon() {
  return (
    <svg {...iconProps} className="theme-icon-to-light" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg {...iconProps} className="theme-icon-to-dark" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}
