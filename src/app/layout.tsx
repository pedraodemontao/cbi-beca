import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AppTopBar } from "@/components/layout/app-top-bar";
import { THEME_COLOR, THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * Aplica o tema salvo antes do primeiro paint.
 *
 * Sem isso a página nasce no tema do aparelho e só corrige depois que o React
 * hidrata — quem escolheu claro num celular no escuro veria a tela piscar
 * preta. Fica inline e síncrono de propósito: qualquer coisa assíncrona chega
 * tarde demais.
 *
 * As constantes vêm de `lib/theme` e NÃO do componente do botão: ele é
 * `'use client'`, e o que o servidor recebe de lá é uma referência que vira
 * texto de erro dentro desta string.
 */
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t;var c=t==='light'?'${THEME_COLOR.light}':'${THEME_COLOR.dark}';document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute('content',c)})}}catch(e){}`;

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

/**
 * `viewport-fit: cover` é o que faz `env(safe-area-inset-*)` devolver valor —
 * sem ele a barra de navegação fixa fica embaixo do home indicator do iPhone.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Duas cores em vez de uma: a barra do navegador acompanha o tema do
  // aparelho de saída, e o botão iguala as duas quando a pessoa escolhe.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f3' },
    { media: '(prefers-color-scheme: dark)', color: '#08080a' },
  ],
};

export const metadata: Metadata = {
  // O iOS ignora o manifesto: quem manda ele abrir em tela cheia é este bloco.
  // `black-translucent` deixa o conteúdo passar por baixo da barra de status, e
  // o `viewport-fit: cover` acima é o que impede o texto de ficar embaixo dela.
  appleWebApp: {
    capable: true,
    title: 'Central CBI',
    statusBarStyle: 'black-translucent',
  },
  other: {
    // O Next emite só `mobile-web-app-capable`, que o iOS entende a partir do
    // 16.4. Em iPhone mais velho, sem esta linha o app abre dentro do Safari
    // com a barra de endereço — funciona, mas não parece app.
    'apple-mobile-web-app-capable': 'yes',
  },
  title: "Central CBI",
  description:
    "Preço teto, carteira e proventos de ações e FIIs — sem economês, com a Beca."
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` cobre o `data-theme` que o script acima
    // escreve antes da hidratação: o servidor não tem como saber o tema salvo,
    // então o atributo SEMPRE difere. Vale só pra este elemento — nada dentro
    // dele deixa de ser conferido.
    <html
      lang="pt-BR"
      className={`${jakarta.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <AppTopBar />
        {children}
        <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
          ⚠️ Conteúdo educacional — não é recomendação de compra ou venda de
          ativos. Toda decisão de investimento é sua.
        </footer>
      </body>
    </html>
  );
}
