export type Periodo = "hoy" | "semana" | "mes" | "anio";

export const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Esta semana" },
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "anio", etiqueta: "Este año" },
];

const MS_HORA = 3_600_000;
const OFFSET_AR = -3 * MS_HORA; // Argentina: UTC-3 todo el año

// Inicio (00:00 hora argentina) del día de "ahora", devuelto como instante UTC.
function inicioDia(ahora: Date): number {
  const local = ahora.getTime() + OFFSET_AR;
  const diaLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
  return diaLocal - OFFSET_AR;
}

// Días que pasaron desde el lunes de la semana de "ahora" (lunes = 0 ... domingo = 6), en hora argentina.
export function diasDesdeLunes(ahora: Date = new Date()): number {
  const dia = new Date(ahora.getTime() + OFFSET_AR).getUTCDay(); // 0 = domingo
  return (dia + 6) % 7;
}

export interface Rango { desde: string; hasta: string }

export function rangoPeriodo(periodo: Periodo, ahora: Date = new Date()): Rango {
  const hoy0 = inicioDia(ahora);
  let desde = hoy0;
  // "Esta semana" va de lunes a domingo: se cuenta desde el lunes (00:00 hora argentina) hasta ahora.
  if (periodo === "semana") desde = hoy0 - diasDesdeLunes(ahora) * 86_400_000;
  if (periodo === "mes" || periodo === "anio") {
    const l = new Date(ahora.getTime() + OFFSET_AR);
    desde = Date.UTC(l.getUTCFullYear(), periodo === "mes" ? l.getUTCMonth() : 0, 1) - OFFSET_AR;
  }
  return { desde: new Date(desde).toISOString(), hasta: new Date(ahora.getTime() + 60_000).toISOString() };
}

// Mueve un instante una unidad del período hacia atrás, respetando el calendario argentino
// (1 de marzo -> 1 de febrero; 31 de marzo -> 28/29 de febrero; 29/02 -> 28/02 del año anterior).
function retroceder(instante: number, periodo: Periodo): number {
  const l = new Date(instante + OFFSET_AR);
  const a = l.getUTCFullYear();
  const m = l.getUTCMonth();
  const d = l.getUTCDate();
  const resto = instante + OFFSET_AR - Date.UTC(a, m, d);
  const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  let y = a, mo = m, dd = d;
  if (periodo === "hoy") dd = d - 1;
  else if (periodo === "semana") dd = d - 7;
  else if (periodo === "mes") {
    y = m === 0 ? a - 1 : a;
    mo = m === 0 ? 11 : m - 1;
    dd = Math.min(d, diasDelMes(y, mo));
  } else {
    y = a - 1;
    dd = Math.min(d, diasDelMes(y, m));
  }
  return Date.UTC(y, mo, dd) + resto - OFFSET_AR;
}

// El mismo tramo del período anterior (para comparar "hasta hoy" contra "hasta hoy" del mes pasado).
export function rangoAnterior(periodo: Periodo, ahora: Date = new Date()): Rango {
  const r = rangoPeriodo(periodo, ahora);
  return {
    desde: new Date(retroceder(new Date(r.desde).getTime(), periodo)).toISOString(),
    hasta: new Date(retroceder(new Date(r.hasta).getTime(), periodo)).toISOString(),
  };
}

// Primer día del mes actual (hora argentina) como "AAAA-MM-01", para las metas.
export function mesActual(ahora: Date = new Date()): string {
  const l = new Date(ahora.getTime() + OFFSET_AR);
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Fecha de hoy en Argentina como "AAAA-MM-DD".
export function hoyAR(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + OFFSET_AR).toISOString().slice(0, 10);
}

// Cuántos días tiene el mes de "ahora" y qué día es (para el ritmo de la meta).
export function diasDelMes(ahora: Date = new Date()): { dia: number; total: number } {
  const l = new Date(ahora.getTime() + OFFSET_AR);
  return { dia: l.getUTCDate(), total: new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth() + 1, 0)).getUTCDate() };
}

// ---------------------------------------------------------------------------------------------------------------
// Navegar por períodos pasados. "offset" = cuántos períodos hacia atrás (0 = el actual, 1 = el anterior...).
// Para un período pasado se devuelve una "ancla": el último minuto de ese período. Todas las funciones que ya
// reciben "ahora" (rangoPeriodo, rangoAnterior, planSerie, hoyAR, mesActual...) la tratan como si el período
// recién hubiera terminado, así el mismo código sirve para el actual y para cualquiera pasado.
const MESES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MS_DIA = 86_400_000;

export function anclaDe(periodo: Periodo, offset: number, ahora: Date = new Date()): Date {
  if (offset <= 0) return ahora;
  const l = new Date(ahora.getTime() + OFFSET_AR);
  let finLocal: number; // inicio (hora local argentina, expresado en UTC) del período siguiente al elegido
  if (periodo === "hoy") finLocal = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - offset + 1);
  else if (periodo === "semana") finLocal = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - diasDesdeLunes(ahora) - 7 * (offset - 1));
  else if (periodo === "mes") finLocal = Date.UTC(l.getUTCFullYear(), l.getUTCMonth() - offset + 1, 1);
  else finLocal = Date.UTC(l.getUTCFullYear() - offset + 1, 0, 1);
  return new Date(finLocal - OFFSET_AR - 60_000);
}

// Nombre del período para mostrar: "Hoy", "Ayer", "Mié 28 oct", "Esta semana", "26 oct – 1 nov", "Octubre 2026", "2025".
export function etiquetaPeriodo(periodo: Periodo, offset: number, ahora: Date = new Date()): string {
  const ancla = anclaDe(periodo, offset, ahora);
  const l = new Date(ancla.getTime() + OFFSET_AR);
  if (periodo === "hoy") {
    if (offset === 0) return "Hoy";
    if (offset === 1) return "Ayer";
    return `${DIAS_SEMANA[l.getUTCDay()].slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${l.getUTCDate()} ${MESES_CORTO[l.getUTCMonth()]}`;
  }
  if (periodo === "semana") {
    if (offset === 0) return "Esta semana";
    if (offset === 1) return "Semana pasada";
    const dom = l; // el ancla cae en el domingo
    const lun = new Date(Date.UTC(dom.getUTCFullYear(), dom.getUTCMonth(), dom.getUTCDate() - 6));
    return `${lun.getUTCDate()} ${MESES_CORTO[lun.getUTCMonth()]} – ${dom.getUTCDate()} ${MESES_CORTO[dom.getUTCMonth()]}`;
  }
  if (periodo === "mes") return `${MESES_LARGO[l.getUTCMonth()]} ${l.getUTCFullYear()}`;
  return String(l.getUTCFullYear());
}

// Lista para saltar directo a un mes o año: [{ offset, texto }], del actual hacia atrás.
export function opcionesDeSalto(periodo: "mes" | "anio", ahora: Date = new Date()): { offset: number; texto: string }[] {
  const cuantos = periodo === "mes" ? 36 : 6;
  return Array.from({ length: cuantos }, (_, offset) => ({ offset, texto: etiquetaPeriodo(periodo, offset, ahora) }));
}

// Fechas AAAA-MM-DD de inicio y fin (inclusive) del período elegido, para las consultas por día.
export function diasDelPeriodo(periodo: Periodo, offset: number, ahora: Date = new Date()): { desde: string; hasta: string } {
  const r = rangoPeriodo(periodo, anclaDe(periodo, offset, ahora));
  const l = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_AR);
  const desde = l(r.desde).toISOString().slice(0, 10);
  const hastaExcl = l(r.hasta).getTime(); // inicio del período siguiente (o ahora+1min en el actual)
  const hasta = offset <= 0 ? hoyAR(ahora) : new Date(hastaExcl - MS_DIA).toISOString().slice(0, 10);
  return { desde, hasta };
}

// Frase para los textos de un período PASADO ("en octubre 2026", "ayer", "la semana pasada"). Vacío si es el actual.
export function rotuloPasado(periodo: Periodo, offset: number, ahora: Date = new Date()): string | undefined {
  if (offset <= 0) return undefined;
  const e = etiquetaPeriodo(periodo, offset, ahora);
  if (periodo === "hoy") return offset === 1 ? "ayer" : `el ${e.toLowerCase()}`;
  if (periodo === "semana") return offset === 1 ? "la semana pasada" : `la semana del ${e}`;
  return `en ${e.toLowerCase()}`;
}
