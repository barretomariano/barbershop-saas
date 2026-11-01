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

export const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function anioDe(mes: string): number {
  return Number(mes.slice(0, 4));
}

// "2026-10" + año 2027 -> "2027-10"; "2026-10" + mes 3 (marzo, 1 a 12) -> "2026-03".
export function conAnio(mes: string, anio: number): string {
  return `${anio}-${mes.slice(5, 7)}`;
}
export function conMes(mes: string, numeroMes: number): string {
  return `${mes.slice(0, 4)}-${String(numeroMes).padStart(2, "0")}`;
}

// Los 12 años que muestra el selector de año, arrancando 4 años antes del que se está mirando.
export function ventanaAnios(anio: number, desplazamiento = 0): number[] {
  const base = anio - 4 + desplazamiento * 12;
  return Array.from({ length: 12 }, (_, i) => base + i);
}

// Qué tan cargado está un día: 0 (nada) a 4 (el más agendado del mes). El tope mínimo evita que un día con
// 2 turnos parezca "lleno" en una barbería tranquila.
export function nivelCarga(cantidad: number, maximo: number): 0 | 1 | 2 | 3 | 4 {
  if (cantidad <= 0) return 0;
  const r = cantidad / Math.max(maximo, 1);
  return r <= 0.25 ? 1 : r <= 0.5 ? 2 : r <= 0.75 ? 3 : 4;
}

export function maximoDelMes(conteo: Map<string, number>, minimo = 6): number {
  return Math.max(minimo, ...conteo.values());
}
