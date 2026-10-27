import type { NextConfig } from "next";

// "export" genera una carpeta `out/` con archivos estáticos.
// La app corre toda en el navegador y la seguridad la pone Supabase (RLS),
// así que se puede publicar gratis en Cloudflare sin servidor propio.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
