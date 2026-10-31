// Matemática de color pura (sin DOM): validar #RRGGBB, mezclar, medir contraste, elegir texto legible y
// sacar los colores dominantes de una imagen. La usan el motor de temas y el selector de colores.

export type Rgb = [number, number, number];

export function normalizarHex(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const v = valor.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) return `#${v.split("").map((c) => c + c).join("").toUpperCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  return null;
}

export function esHex(valor: unknown): valor is string {
  return typeof valor === "string" && /^#[0-9A-F]{6}$/.test(valor);
}

export function aRgb(hex: string): Rgb {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
}

export function aHex([r, g, b]: Rgb): string {
  const h = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

// Mezcla `a` con `b`: t=0 devuelve a, t=1 devuelve b.
export function mezclar(a: string, b: string, t: number): string {
  const [x, y] = [aRgb(a), aRgb(b)];
  return aHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * t) as Rgb);
}

function luz(hex: string): number {
  const [r, g, b] = aRgb(hex).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Contraste WCAG entre dos colores #RRGGBB (1 a 21).
export function contraste(a: string, b: string): number {
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export const TINTA_OSCURA = "#140F0B";
export const TINTA_CLARA = "#FFFFFF";

// Texto (oscuro o blanco) que mejor se lee sobre un color de relleno.
export function tintaSobre(fondo: string): string {
  return contraste(fondo, TINTA_OSCURA) >= contraste(fondo, TINTA_CLARA) ? TINTA_OSCURA : TINTA_CLARA;
}

// Acerca `color` al blanco (aclarar) o al negro (oscurecer) de a poco hasta que contraste `minimo` contra `fondo`.
// Si ya cumple, lo devuelve igual. Conserva el tono: solo cambia cuánto se parece al blanco o al negro.
export function asegurarContraste(color: string, fondo: string, minimo: number, direccion: "aclarar" | "oscurecer"): string {
  const meta = direccion === "aclarar" ? "#FFFFFF" : "#000000";
  let actual = color;
  for (let paso = 0; paso <= 25 && contraste(actual, fondo) < minimo; paso++) actual = mezclar(color, meta, (paso + 1) * 0.04);
  return actual;
}

// ---------- Colores dominantes de una imagen (para "tomar los colores de mi logo") ----------

function aHsv([r, g, b]: Rgb): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb), d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6; else if (max === gg) h = (bb - rr) / d + 2; else h = (rr - gg) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

const distTono = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

// `pixeles` es RGBA (como ImageData.data). Ignora transparentes, blancos, negros y grises: se queda con lo que
// tiene color. Agrupa en baldes, pondera por saturación y devuelve hasta 2 colores bien distintos entre sí.
export function extraerColores(pixeles: ArrayLike<number>): { principal: string; secundario: string } | null {
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixeles.length; i += 4) {
    const [r, g, b, a] = [pixeles[i], pixeles[i + 1], pixeles[i + 2], pixeles[i + 3]];
    if (a < 128) continue;
    const [, s, v] = aHsv([r, g, b]);
    if (s < 0.25 || v < 0.2 || v > 0.98 && s < 0.35) continue;
    const clave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const x = baldes.get(clave) ?? { n: 0, r: 0, g: 0, b: 0 };
    x.n += 1; x.r += r; x.g += g; x.b += b;
    baldes.set(clave, x);
  }
  const ranking = [...baldes.values()]
    .map((x) => {
      const rgb: Rgb = [x.r / x.n, x.g / x.n, x.b / x.n];
      return { hex: aHex(rgb), tono: aHsv(rgb)[0], peso: x.n * (0.5 + aHsv(rgb)[1]) };
    })
    .sort((a, b) => b.peso - a.peso);
  if (ranking.length === 0) return null;
  const principal = ranking[0];
  const otro = ranking.find((c) => distTono(c.tono, principal.tono) >= 40);
  // Sin un segundo color propio, se usa el mismo tono más profundo: queda en la misma familia.
  return { principal: principal.hex, secundario: otro ? otro.hex : mezclar(principal.hex, "#000000", 0.45) };
}
