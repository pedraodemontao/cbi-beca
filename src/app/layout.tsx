import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
