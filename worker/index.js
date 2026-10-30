// Worker de Cloudflare: sirve la app estática y, para los links /b/<slug>, arma la PWA propia de cada barbería
// (manifiesto con su nombre y logo, título y íconos de la página). Todo lo demás lo sirven los archivos estáticos.
import { construirManifiesto, jsonParaScript, logoParaPagina, nombreCorto } from "../src/lib/manifest.ts";

const RUTA = /^\/b\/([a-z0-9][a-z0-9-]{1,28}[a-z0-9])(\/.*)?$/;
const SEGURIDAD = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

async function traerMarca(env, slug) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/branding_publico`, {
      method: "POST",
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_slug: slug }),
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!r.ok) return null;
    const filas = await r.json();
    return Array.isArray(filas) && filas[0] ? filas[0] : null;
  } catch {
    return null;
  }
}

const trabajador = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = RUTA.exec(url.pathname);
    if (!m) return env.ASSETS.fetch(request);
    const slug = m[1];
    const resto = m[2] ?? "/";
    const marca = await traerMarca(env, slug);

    if (resto === "/manifest.webmanifest") {
      if (!marca) return new Response("No existe esa barbería.", { status: 404 });
      return new Response(JSON.stringify(construirManifiesto(slug, marca, env.SUPABASE_URL)), {
        headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=300", ...SEGURIDAD },
      });
    }

    // Cualquier otra ruta bajo /b/<slug>/ es la app (que decide qué mostrar en el navegador).
    const pagina = await env.ASSETS.fetch(new Request(new URL("/", url), { headers: request.headers }));
    if (!marca) return new Response(pagina.body, { status: pagina.status, headers: { ...Object.fromEntries(pagina.headers), ...SEGURIDAD } });

    const info = logoParaPagina(slug, marca, env.SUPABASE_URL);
    const icono = info.logo ?? "/icons/apple-touch-icon.png";
    const reescrita = new HTMLRewriter()
      .on("title", { element(e) { e.setInnerContent(marca.name); } })
      .on('link[rel="manifest"]', { element(e) { e.setAttribute("href", `/b/${slug}/manifest.webmanifest`); } })
      .on('link[rel="icon"]', { element(e) { e.setAttribute("href", icono); } })
      .on('link[rel="apple-touch-icon"]', { element(e) { e.setAttribute("href", icono); } })
      .on('meta[name="apple-mobile-web-app-title"]', { element(e) { e.setAttribute("content", nombreCorto(marca.name)); } })
      .on("head", { element(e) { e.append(`<script>window.__MARCA=${jsonParaScript(info)};</script>`, { html: true }); } })
      .transform(pagina);
    const headers = new Headers(reescrita.headers);
    for (const [k, v] of Object.entries(SEGURIDAD)) headers.set(k, v);
    headers.set("Cache-Control", "no-cache");
    return new Response(reescrita.body, { status: 200, headers });
  },
};

export default trabajador;
