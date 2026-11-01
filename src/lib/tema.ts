// Apariencia de la app: tema (claro / oscuro / automático) y los dos colores de marca del negocio.
// El tema es una preferencia de cada dispositivo. Los colores los elige el dueño (principal y secundario, libres)
// y valen para todo el negocio (businesses.primary_color / secondary_color, migración 13).
// Los componentes solo usan variables CSS; acá se calculan para que todo color elegido se lea bien en ambos temas.
import { asegurarContraste, contraste, esHex, mezclar, normalizarHex, tintaSobre, TINTA_CLARA, TINTA_OSCURA } from "./colores";

export { contraste, TINTA_CLARA, TINTA_OSCURA };

export type Tema = "oscuro" | "claro";
export type PrefTema = Tema | "auto";

export interface Marca { principal: string; secundario: string }

// Pares sugeridos para elegir rápido (el dueño igual puede poner cualquier color).
export const SUGERENCIAS: { id: string; nombre: string; marca: Marca }[] = [
  { id: "brasa", nombre: "Brasa", marca: { principal: "#FF7A3D", secundario: "#3E63FF" } },
  { id: "lima", nombre: "Lima", marca: { principal: "#D4F51F", secundario: "#7C5CFF" } },
  { id: "ambar", nombre: "Ámbar", marca: { principal: "#F5B83D", secundario: "#E5484D" } },
  { id: "jade", nombre: "Jade", marca: { principal: "#34C796", secundario: "#3E63FF" } },
  { id: "cobalto", nombre: "Cobalto", marca: { principal: "#5B8CFF", secundario: "#FF8A5B" } },
  { id: "lila", nombre: "Lila", marca: { principal: "#A08CFF", secundario: "#FF7AA8" } },
  { id: "granate", nombre: "Granate", marca: { principal: "#F0575C", secundario: "#F5B83D" } },
];

export const MARCA_POR_DEFECTO: Marca = SUGERENCIAS[0].marca;
export const PREF_TEMA_POR_DEFECTO: PrefTema = "claro";

export const CLAVE_TEMA = "barberia.tema";
export const CLAVE_MARCA = "barberia.marca"; // "#PRINCIPAL|#SECUNDARIO"
export const CLAVE_VARIABLES = "barberia.variables"; // variables ya calculadas por tema, para pintar sin parpadeo

// Fondos base de cada tema (el claro es el arena/ámbar de la app; el oscuro es negro AMOLED puro).
export const FONDO_CLARO = "#EFE6DB";
export const FONDO_OSCURO = "#000000";

// Cuánto del color principal se funde en el degradado del modo claro (suave: no rompe el arena).
export const FUSION_CLARO = { arriba: 0.24, abajo: 0.13 };

export function esTema(valor: unknown): valor is Tema {
  return valor === "oscuro" || valor === "claro";
}
export function esPrefTema(valor: unknown): valor is PrefTema {
  return valor === "oscuro" || valor === "claro" || valor === "auto";
}

export function marcaValida(principal: unknown, secundario: unknown): Marca | null {
  const [p, s] = [normalizarHex(principal), normalizarHex(secundario)];
  return p && s ? { principal: p, secundario: s } : null;
}

export function marcasIguales(a: Marca, b: Marca): boolean {
  return a.principal === b.principal && a.secundario === b.secundario;
}

export function serializarMarca(m: Marca): string { return `${m.principal}|${m.secundario}`; }
export function leerMarcaSerializada(v: unknown): Marca | null {
  if (typeof v !== "string") return null;
  const [p, s] = v.split("|");
  return marcaValida(p, s);
}

export function resolverTema(pref: PrefTema, sistemaOscuro: boolean): Tema {
  return pref === "auto" ? (sistemaOscuro ? "oscuro" : "claro") : pref;
}

// Un color de relleno (cápsula sólida, barra, botón de acento) tiene que despegarse del fondo del tema.
// Además tiene que admitir texto encima: los tonos medios no se leen ni con tinta oscura ni con blanca, así que en
// oscuro se aclaran y en claro se oscurecen (la misma dirección en que ya se despegan del fondo) hasta que alguna pase 4.5:1.
function relleno(color: string, tema: Tema): string {
  let c = tema === "oscuro" ? asegurarContraste(color, FONDO_OSCURO, 2.4, "aclarar") : asegurarContraste(color, FONDO_CLARO, 1.5, "oscurecer");
  for (let i = 0; i < 25 && contraste(c, tintaSobre(c)) < 4.5; i++) c = mezclar(c, tema === "oscuro" ? "#FFFFFF" : "#000000", 0.04);
  return c;
}
// Un color usado como texto o trazo fino tiene que leerse sobre el fondo del tema.
function legible(color: string, tema: Tema, minimo: number): string {
  return tema === "oscuro" ? asegurarContraste(color, FONDO_OSCURO, minimo, "aclarar") : asegurarContraste(color, FONDO_CLARO, minimo, "oscurecer");
}

// Color de texto que además admite texto encima si alguien lo usa de relleno: los grises medios no se leen con
// ninguna tinta, así que se sigue aclarando u oscureciendo hasta que alguna de las dos pase 4.5:1.
function acentoLegible(color: string, tema: Tema): string {
  let minimo = 4.5;
  let c = legible(color, tema, minimo);
  while (minimo < 9 && contraste(c, tintaSobre(c)) < 4.5) { minimo += 0.5; c = legible(color, tema, minimo); }
  return c;
}

// Variables CSS que se aplican en <html>.
//  --acento / --tinta-acento: principal como texto (≥4.5:1) y el texto que va encima si se usa de relleno.
//  --acento-vivo / --sobre-vivo: principal como relleno sólido (cápsula héroe, barra, línea) y su texto legible.
//  --par / --par-vivo / --sobre-par: lo mismo para el color secundario (trazos ≥3:1).
//  --fondo-claro: degradado del modo claro (arena fundida con el principal, suavizado).
export function variablesDeMarca(marca: Marca, tema: Tema): Record<string, string> {
  const p = esHex(marca.principal) ? marca.principal : MARCA_POR_DEFECTO.principal;
  const s = esHex(marca.secundario) ? marca.secundario : MARCA_POR_DEFECTO.secundario;
  const acento = acentoLegible(p, tema);
  const vivo = relleno(p, tema);
  const parVivo = relleno(s, tema);
  const arriba = mezclar(FONDO_CLARO, vivo, FUSION_CLARO.arriba);
  const abajo = mezclar(FONDO_CLARO, vivo, FUSION_CLARO.abajo);
  return {
    "--acento": acento,
    "--tinta-acento": tintaSobre(acento),
    "--acento-vivo": vivo,
    "--sobre-vivo": tintaSobre(vivo),
    "--par": legible(s, tema, 3),
    "--par-vivo": parVivo,
    "--sobre-par": tintaSobre(parVivo),
    "--fondo-claro": `linear-gradient(168deg, ${arriba} 0%, ${FONDO_CLARO} 46%, ${abajo} 100%)`,
  };
}

function colorBarra(tema: Tema): string { return tema === "oscuro" ? FONDO_OSCURO : FONDO_CLARO.toLowerCase(); }

// Aplica tema y colores al documento. Seguro de llamar en el navegador; no hace nada en el servidor.
export function aplicarApariencia(pref: PrefTema, marca: Marca): Tema {
  const oscuroSistema = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const tema = resolverTema(pref, oscuroSistema);
  if (typeof document === "undefined") return tema;
  const raiz = document.documentElement;
  raiz.dataset.tema = tema;
  for (const [k, v] of Object.entries(variablesDeMarca(marca, tema))) raiz.style.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", colorBarra(tema));
  // Se guardan los valores ya calculados para que el próximo arranque pinte el color correcto antes de cargar React.
  try {
    window.localStorage.setItem(CLAVE_VARIABLES, JSON.stringify({ claro: variablesDeMarca(marca, "claro"), oscuro: variablesDeMarca(marca, "oscuro") }));
  } catch { /* sin almacenamiento: no pasa nada */ }
  return tema;
}

export function leerPrefTema(): PrefTema {
  try {
    const v = window.localStorage.getItem(CLAVE_TEMA);
    return esPrefTema(v) ? v : PREF_TEMA_POR_DEFECTO;
  } catch { return PREF_TEMA_POR_DEFECTO; }
}

export function leerMarcaLocal(): Marca {
  try { return leerMarcaSerializada(window.localStorage.getItem(CLAVE_MARCA)) ?? MARCA_POR_DEFECTO; } catch { return MARCA_POR_DEFECTO; }
}

export function guardarLocal(clave: string, valor: string): void {
  try { window.localStorage.setItem(clave, valor); } catch { /* sin almacenamiento: no pasa nada */ }
}

// Script que corre antes de pintar para que no haya parpadeo de colores al abrir la app.
const POR_DEFECTO = { claro: variablesDeMarca(MARCA_POR_DEFECTO, "claro"), oscuro: variablesDeMarca(MARCA_POR_DEFECTO, "oscuro") };
export const SCRIPT_INICIAL = `(function(){try{var p=localStorage.getItem("${CLAVE_TEMA}");var o=p==="oscuro"||(p==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var t=o?"oscuro":"claro";var V=null;try{V=JSON.parse(localStorage.getItem("${CLAVE_VARIABLES}"))}catch(e){}var D=${JSON.stringify(POR_DEFECTO)};var v=(V&&V[t])||D[t];var r=document.documentElement;r.dataset.tema=t;for(var k in v){r.style.setProperty(k,v[k])}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",o?"${FONDO_OSCURO}":"${FONDO_CLARO.toLowerCase()}");}catch(e){}})();`;
