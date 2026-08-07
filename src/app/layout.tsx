import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

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
  themeColor: '#08080a',
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
    <html lang="pt-BR" className={`${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <footer className="px-5 py-6 text-center text-xs text-muted-foreground">
          ⚠️ Conteúdo educacional — não é recomendação de compra ou venda de
          ativos. Toda decisão de investimento é sua.
        </footer>
      </body>
    </html>
  );
}
