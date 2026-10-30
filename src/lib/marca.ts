// Marca propia de cada barbería: nombre, dirección (slug) y logo.
// El link de la barbería es <sitio>/b/<slug>. Los logos están en el bucket público "logos" de Supabase Storage.

export const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// "Barbería El Corte" -> "barberia-el-corte"
export function normalizarSlug(texto: string): string {
  return texto
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/g, "");
}

export function slugValido(slug: string): boolean {
  return SLUG_VALIDO.test(slug);
}

export function linkBarberia(origen: string, slug: string): string {
  return `${origen.replace(/\/+$/, "")}/b/${slug}`;
}

// Dirección de un logo ya subido. La versión evita que se vea el logo viejo en caché.
export function urlLogo(supabaseUrl: string, negocio: string, version: number, tam: 192 | 512): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/logos/${negocio}/logo-${tam}.png?v=${version}`;
}

export function slugDeRuta(ruta: string): string | null {
  const m = /^\/b\/([a-z0-9-]{3,30})(?:\/|$)/.exec(ruta);
  return m && slugValido(m[1]) ? m[1] : null;
}

// Marca que el Worker inyecta en la página cuando se entra por /b/<slug>.
export interface MarcaPublica { slug: string; nombre: string; logo: string | null }

let ultimaCruda: unknown = undefined;
let ultimaMarca: MarcaPublica | null = null;

// Devuelve siempre el mismo objeto mientras la marca inyectada no cambie (necesario para useSyncExternalStore).
export function leerMarcaInyectada(): MarcaPublica | null {
  if (typeof window === "undefined") return null;
  const m = (window as unknown as { __MARCA?: Partial<MarcaPublica> }).__MARCA;
  if (m === ultimaCruda) return ultimaMarca;
  ultimaCruda = m;
  ultimaMarca = m && typeof m.nombre === "string" && typeof m.slug === "string"
    ? { slug: m.slug, nombre: m.nombre, logo: typeof m.logo === "string" ? m.logo : null }
    : null;
  return ultimaMarca;
}

// Lado del recorte cuadrado centrado de una imagen (para que el logo no se deforme).
export function recorteCentrado(ancho: number, alto: number): { x: number; y: number; lado: number } {
  const lado = Math.min(ancho, alto);
  return { x: Math.round((ancho - lado) / 2), y: Math.round((alto - lado) / 2), lado };
}

// Convierte la imagen elegida en los dos PNG cuadrados que usa la PWA (192 y 512). Solo en el navegador.
export async function prepararLogo(archivo: File): Promise<{ p192: Blob; p512: Blob }> {
  if (!archivo.type.startsWith("image/")) throw new Error("El archivo tiene que ser una imagen (PNG, JPG o WebP).");
  if (archivo.size > 8 * 1024 * 1024) throw new Error("La imagen pesa demasiado. Elegí una de menos de 8 MB.");
  const bmp = await createImageBitmap(archivo);
  const { x, y, lado } = recorteCentrado(bmp.width, bmp.height);
  const hacer = (tam: number) => new Promise<Blob>((ok, mal) => {
    const c = document.createElement("canvas");
    c.width = tam; c.height = tam;
    const g = c.getContext("2d");
    if (!g) { mal(new Error("Tu navegador no pudo procesar la imagen.")); return; }
    g.imageSmoothingQuality = "high";
    g.drawImage(bmp, x, y, lado, lado, 0, 0, tam, tam);
    c.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo preparar la imagen."))), "image/png");
  });
  const [p192, p512] = await Promise.all([hacer(192), hacer(512)]);
  bmp.close();
  if (p512.size > 1024 * 1024) throw new Error("El logo quedó muy pesado. Probá con una imagen más simple o con menos detalle.");
  return { p192, p512 };
}
