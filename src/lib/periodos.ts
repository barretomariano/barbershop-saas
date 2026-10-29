export type Periodo = "hoy" | "semana" | "mes" | "anio";

export const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "semana", etiqueta: "Últimos 7 días" },
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

export interface Rango { desde: string; hasta: string }

export function rangoPeriodo(periodo: Periodo, ahora: Date = new Date()): Rango {
  const hoy0 = inicioDia(ahora);
  let desde = hoy0;
  if (periodo === "semana") desde = hoy0 - 6 * 86_400_000;
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
