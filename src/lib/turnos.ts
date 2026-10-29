import type { EstadoTurno, Turno } from "./tipos";

const TZ = "America/Argentina/Buenos_Aires";

// "2026-10-30" + "15:30" (hora argentina, UTC-3) -> instante ISO.
export function fechaHoraAIso(fecha: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const d = new Date(`${fecha}T${hora}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Rango [desde, hasta) de un día argentino.
export function rangoDia(fecha: string): { desde: string; hasta: string } | null {
  const desde = fechaHoraAIso(fecha, "00:00");
  if (!desde) return null;
  return { desde, hasta: new Date(new Date(desde).getTime() + 86_400_000).toISOString() };
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function fechaLarga(fecha: string): string {
  return new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${fecha}T12:00:00Z`));
}

// Un turno "por cerrar" es uno terminado que falta cobrar, o uno programado cuya hora de fin ya pasó
// y nadie marcó (el barbero pudo olvidarse de terminarlo, cobrarlo o cancelarlo).
export function esPorCerrar(t: Pick<Turno, "status" | "ends_at">, ahora: Date = new Date()): boolean {
  return t.status === "DONE" || (t.status === "SCHEDULED" && new Date(t.ends_at).getTime() <= ahora.getTime());
}

export const ETIQUETA_ESTADO: Record<EstadoTurno, string> = {
  SCHEDULED: "Programado",
  DONE: "Terminado · falta cobrar",
  PAID: "Cobrado",
  CANCELED: "Cancelado",
  NO_SHOW: "No vino",
};

export function nombreCliente(t: Pick<Turno, "clients" | "client_name">): string {
  return t.clients?.name ?? t.client_name ?? "Sin nombre";
}

// Horarios de 15 en 15 minutos para elegir al agendar.
export function horasDelDia(desde = 7, hasta = 22): string[] {
  const salida: string[] = [];
  for (let h = desde; h <= hasta; h++) for (const m of [0, 15, 30, 45]) salida.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  return salida;
}

// Teléfono argentino -> número para wa.me. 10 dígitos (código de área + número) se asumen celular: 549...
export function telefonoParaWhatsApp(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "").replace(/^0+/, "");
  if (digitos.length < 8) return null;
  if (digitos.startsWith("54")) return digitos;
  if (digitos.length === 10) return `549${digitos}`;
  return digitos;
}

export const DIAS_SEMANA: { valor: number; corto: string; largo: string }[] = [
  { valor: 1, corto: "Lun", largo: "Lunes" }, { valor: 2, corto: "Mar", largo: "Martes" },
  { valor: 3, corto: "Mié", largo: "Miércoles" }, { valor: 4, corto: "Jue", largo: "Jueves" },
  { valor: 5, corto: "Vie", largo: "Viernes" }, { valor: 6, corto: "Sáb", largo: "Sábado" },
  { valor: 7, corto: "Dom", largo: "Domingo" },
];
