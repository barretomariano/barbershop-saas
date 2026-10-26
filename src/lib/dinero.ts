// Montos en pesos argentinos (ARS), siempre en enteros. Nunca decimales.

export function formatearARS(monto: number): string {
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
