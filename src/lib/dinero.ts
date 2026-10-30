// Montos en pesos argentinos (ARS), siempre en enteros. Nunca decimales.

// Privacidad: cuando está activa, los montos se muestran tapados (la app lo enciende desde el botón de la cabecera).
let montosOcultos = false;
export const MONTO_TAPADO = "$ ••••";
export function setMontosOcultos(v: boolean): void { montosOcultos = v; }
export function getMontosOcultos(): boolean { return montosOcultos; }

export function formatearARS(monto: number): string {
  if (!Number.isInteger(monto)) {
    throw new Error("El monto debe ser un número entero de pesos.");
  }
  if (montosOcultos) return MONTO_TAPADO;
  return formatearARSReal(monto);
}

// Siempre el monto verdadero: para formularios donde la persona necesita ver lo que está cargando.
export function formatearARSReal(monto: number): string {
  if (!Number.isInteger(monto)) {
    throw new Error("El monto debe ser un número entero de pesos.");
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(monto);
}

export function formatearHora(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
