export type Periodo = "hoy" | "semana" | "mes";

const MS_HORA = 3_600_000;
const OFFSET_AR = -3 * MS_HORA; // Argentina: UTC-3 todo el año

// Inicio (00:00 hora argentina) del día de "ahora", devuelto como instante UTC.
function inicioDia(ahora: Date): number {
  const local = ahora.getTime() + OFFSET_AR;
  const diaLocal = local - (((local % 86_400_000) + 86_400_000) % 86_400_000);
  return diaLocal - OFFSET_AR;
}

export function rangoPeriodo(periodo: Periodo, ahora: Date = new Date()): { desde: string; hasta: string } {
  const hoy0 = inicioDia(ahora);
  let desde = hoy0;
  if (periodo === "semana") desde = hoy0 - 6 * 86_400_000;
  if (periodo === "mes") {
    const l = new Date(ahora.getTime() + OFFSET_AR);
    desde = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - OFFSET_AR;
  }
  return { desde: new Date(desde).toISOString(), hasta: new Date(ahora.getTime() + 60_000).toISOString() };
}
