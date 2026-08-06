import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  images: {
    // Logos das empresas, servidas pela brapi junto do catálogo. É o único host
    // externo de imagem do app — `logo_url` de `companies` sempre aponta pra cá.
    remotePatterns: [{ protocol: 'https', hostname: 'icons.brapi.dev' }],
  },
};

export default nextConfig;
