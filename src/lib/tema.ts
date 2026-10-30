// Apariencia de la app: tema (claro cálido por defecto, oscuro opcional) y color de énfasis del negocio.
// El tema es una preferencia de cada dispositivo. El color de énfasis lo elige el dueño y vale para todo el negocio
// (se guarda en businesses.accent). Una paleta cerrada y curada evita colores que no se leen bien.

export type Tema = "oscuro" | "claro";
export type IdAcento = "brasa" | "ambar" | "jade" | "cobalto" | "lila" | "granate";

export interface Acento {
  id: IdAcento;
  nombre: string;
  base: string;   // color sobre fondo oscuro
  fuerte: string; // color sobre fondo claro (más profundo, para que se lea)
  par: string;    // segundo color del degradado (el "orbe")
}

export const ACENTOS: Acento[] = [
  { id: "brasa", nombre: "Brasa", base: "#FF7A3D", fuerte: "#B9420F", par: "#3E63FF" },
  { id: "ambar", nombre: "Ámbar", base: "#F5B83D", fuerte: "#8F5B00", par: "#E5484D" },
  { id: "jade", nombre: "Jade", base: "#34C796", fuerte: "#0B7556", par: "#3E63FF" },
  { id: "cobalto", nombre: "Cobalto", base: "#5B8CFF", fuerte: "#2150D0", par: "#FF8A5B" },
  { id: "lila", nombre: "Lila", base: "#A08CFF", fuerte: "#5B43D6", par: "#FF7AA8" },
  { id: "granate", nombre: "Granate", base: "#F0575C", fuerte: "#BE2A30", par: "#F5B83D" },
];

export const ACENTO_POR_DEFECTO: IdAcento = "brasa";
export const TEMA_POR_DEFECTO: Tema = "claro";

export const CLAVE_TEMA = "barberia.tema";
export const CLAVE_ACENTO = "barberia.acento";

const TINTA_OSCURA = "#140F0B"; // texto sobre el acento en tema oscuro
const TINTA_CLARA = "#FFFFFF"; // texto sobre el acento en tema claro

export function esAcento(valor: unknown): valor is IdAcento {
  return typeof valor === "string" && ACENTOS.some((a) => a.id === valor);
}

export function esTema(valor: unknown): valor is Tema {
  return valor === "oscuro" || valor === "claro";
}

export function acentoPorId(id: unknown): Acento {
  return ACENTOS.find((a) => a.id === id) ?? ACENTOS[0];
}

// Valores CSS que se aplican en <html>. Los componentes solo usan var(--acento), var(--tinta-acento) y var(--par).
export function variablesDeAcento(id: unknown, tema: Tema): Record<string, string> {
  const a = acentoPorId(id);
  return {
    "--acento": tema === "oscuro" ? a.base : a.fuerte,
    "--tinta-acento": tema === "oscuro" ? TINTA_OSCURA : TINTA_CLARA,
    "--acento-vivo": a.base,
    "--par": a.par,
  };
}

// Contraste WCAG entre dos colores #RRGGBB (se usa en los tests para garantizar que el texto se lee).
export function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [luz(a), luz(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export const TINTAS = { oscura: TINTA_OSCURA, clara: TINTA_CLARA };

// Aplica tema y acento al documento. Seguro de llamar en el navegador; no hace nada en el servidor.
export function aplicarApariencia(tema: Tema, acento: unknown): void {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  for (const [k, v] of Object.entries(variablesDeAcento(acento, tema))) raiz.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", tema === "oscuro" ? "#0D0C0C" : "#EFE6DB");
}

export function leerTema(): Tema {
  try {
    const v = window.localStorage.getItem(CLAVE_TEMA);
    return esTema(v) ? v : TEMA_POR_DEFECTO;
  } catch { return TEMA_POR_DEFECTO; }
}

export function leerAcentoLocal(): IdAcento {
  try {
    const v = window.localStorage.getItem(CLAVE_ACENTO);
    return esAcento(v) ? v : ACENTO_POR_DEFECTO;
  } catch { return ACENTO_POR_DEFECTO; }
}

export function guardarLocal(clave: string, valor: string): void {
  try { window.localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no pasa nada */ }
}

// Script que corre antes de pintar para que no haya parpadeo de colores al abrir la app.
export const SCRIPT_INICIAL = `(function(){try{var t=localStorage.getItem("${CLAVE_TEMA}");var a=localStorage.getItem("${CLAVE_ACENTO}");var P=${JSON.stringify(
  Object.fromEntries(ACENTOS.map((x) => [x.id, [x.base, x.fuerte, x.par]])),
)};var c=P[a]||P.brasa;var o=t==="oscuro";var r=document.documentElement;r.dataset.tema=o?"oscuro":"claro";r.style.setProperty("--acento",o?c[0]:c[1]);r.style.setProperty("--tinta-acento",o?"${TINTA_OSCURA}":"${TINTA_CLARA}");r.style.setProperty("--acento-vivo",c[0]);r.style.setProperty("--par",c[2]);}catch(e){}})();`;
