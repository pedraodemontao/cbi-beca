import type { MetadataRoute } from 'next';

/**
 * Manifesto do app instalável.
 *
 * A ferramenta é usada principalmente no celular, e sem isso a usuária só
 * conseguia abrir pela barra do navegador — com a URL comendo uma faixa da tela
 * e sem ícone próprio. Com o manifesto ela adiciona à tela de início e abre em
 * tela cheia.
 *
 * Os ícones ficam em `public/` como arquivo fixo de propósito: rota gerada pelo
 * Next carrega hash na URL, e tanto o manifesto quanto o iOS querem caminho
 * estável.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Central CBI',
    // Cabe embaixo do ícone na tela de início; nome longo o Android corta.
    short_name: 'CBI',
    description:
      'Preço teto, carteira e proventos de ações e fundos listados na B3.',
    start_url: '/',
    display: 'standalone',
    background_color: '#08080a',
    theme_color: '#08080a',
    lang: 'pt-BR',
    dir: 'ltr',
    categories: ['finance'],
    // Sem `orientation` travada: a tabela de preço teto ganha muito em paisagem,
    // e forçar retrato tiraria essa escolha da usuária.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // O Android recorta o ícone em círculo, losango ou squircle conforme o
      // aparelho. O `maskable` tem 20% de folga em volta pra sobreviver a
      // qualquer um desses cortes sem perder as letras.
      {
        src: '/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
