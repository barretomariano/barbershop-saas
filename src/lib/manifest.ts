import { urlLogo } from "./marca";

// Piezas puras del Worker que arma la PWA de cada barbería: manifiesto, nombre corto y marca inyectada en la página.
export interface MarcaDb { business_id: string; name: string; accent: string; logo_version: number }

const FONDO = "#efe6db";

// Debajo del ícono se muestran ~12 caracteres: se corta en una palabra completa si se puede.
export function nombreCorto(nombre: string): string {
  const n = nombre.trim();
  if (n.length <= 12) return n;
  const primera = n.split(/\s+/)[0];
  return primera.length >= 3 && primera.length <= 12 ? primera : n.slice(0, 12);
}

export function construirManifiesto(slug: string, marca: MarcaDb, supabaseUrl: string) {
  const base = `/b/${slug}/`;
  const iconos = marca.logo_version > 0
    ? [192, 512].map((t) => ({ src: urlLogo(supabaseUrl, marca.business_id, marca.logo_version, t as 192 | 512), sizes: `${t}x${t}`, type: "image/png", purpose: "any" }))
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  return {
    id: base, name: marca.name, short_name: nombreCorto(marca.name), description: `Ventas, turnos y caja de ${marca.name}.`,
    lang: "es-AR", start_url: base, scope: base, display: "standalone", background_color: FONDO, theme_color: FONDO, icons: iconos,
  };
}

export function logoParaPagina(slug: string, marca: MarcaDb, supabaseUrl: string): { slug: string; nombre: string; logo: string | null } {
  return { slug, nombre: marca.name, logo: marca.logo_version > 0 ? urlLogo(supabaseUrl, marca.business_id, marca.logo_version, 512) : null };
}

// JSON seguro para incrustar dentro de un <script>: evita que un nombre con "</script>" rompa la página.
export function jsonParaScript(valor: unknown): string {
  return JSON.stringify(valor).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
