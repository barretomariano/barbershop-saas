// Ayudas del calendario mensual de la agenda. Las fechas son "YYYY-MM-DD" y los meses "YYYY-MM", en hora argentina.
import { fechaHoraAIso } from "./turnos";

const TZ = "America/Argentina/Buenos_Aires";

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

export function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Rango [desde, hasta) del mes completo, como instantes ISO.
export function rangoMes(mes: string): { desde: string; hasta: string } | null {
  if (!/^\d{4}-\d{2}$/.test(mes)) return null;
  const desde = fechaHoraAIso(`${mes}-01`, "00:00");
  const hasta = fechaHoraAIso(`${sumarMeses(mes, 1)}-01`, "00:00");
  return desde && hasta ? { desde, hasta } : null;
}

export function diasDelMesDe(mes: string): number {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

// Grilla del mes empezando en lunes: null = casilla vacía antes del día 1.
export function celdasDelMes(mes: string): (string | null)[] {
  const [a, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(a, m - 1, 1)).getUTCDay(); // 0 = domingo
  const vacias = (primero + 6) % 7;
  const celdas: (string | null)[] = Array(vacias).fill(null);
  for (let d = 1; d <= diasDelMesDe(mes); d++) celdas.push(`${mes}-${String(d).padStart(2, "0")}`);
  return celdas;
}

export function nombreMes(mes: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${mes}-01T12:00:00Z`));
}

// Día argentino ("YYYY-MM-DD") al que pertenece un instante.
export function fechaAR(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function numeroDelDia(fecha: string): number {
  return Number(fecha.slice(8, 10));
}
