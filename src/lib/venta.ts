import type { MedioPago } from "./tipos";
import { parsearMonto } from "./validacion";

// Pasos del modal de nueva venta. Cada paso se desbloquea cuando el anterior está completo.
export type Paso = "servicio" | "pago" | "cliente" | "nota" | "confirmar";

export interface EstadoVenta {
  servicioId: string | null;
  otroMonto: boolean;       // se eligió "Otro monto" en vez de un servicio
  monto: string;
  medio: MedioPago | null;
  clienteElegido: boolean;  // "Sin cliente" también cuenta como elegido
  clienteId: string;
  nota: string;
  notaHecha: boolean;       // tocó "Continuar" u "Omitir"
}

export const ESTADO_INICIAL: EstadoVenta = {
  servicioId: null, otroMonto: false, monto: "", medio: null, clienteElegido: false, clienteId: "", nota: "", notaHecha: false,
};

export function pasosDeVenta(hayClientes: boolean, esTurno: boolean): Exclude<Paso, "confirmar">[] {
  if (esTurno) return ["pago"];
  return ["servicio", "pago", ...(hayClientes ? (["cliente"] as const) : []), "nota"];
}

export function pasoCompleto(p: Exclude<Paso, "confirmar">, e: EstadoVenta): boolean {
  switch (p) {
    case "servicio": return parsearMonto(e.monto) !== null && (e.servicioId !== null || e.otroMonto);
    case "pago": return e.medio !== null;
    case "cliente": return e.clienteElegido;
    case "nota": return e.notaHecha;
  }
}

// Un paso se puede abrir solo si todos los anteriores están completos.
export function pasoAlcanzable(pasos: Exclude<Paso, "confirmar">[], p: Exclude<Paso, "confirmar">, e: EstadoVenta): boolean {
  const i = pasos.indexOf(p);
  return i >= 0 && pasos.slice(0, i).every((x) => pasoCompleto(x, e));
}

// A dónde va el modal después de completar un paso: al primer paso pendiente, y si no queda ninguno, a confirmar.
export function siguientePaso(pasos: Exclude<Paso, "confirmar">[], e: EstadoVenta): Paso {
  return pasos.find((p) => !pasoCompleto(p, e)) ?? "confirmar";
}

export function ventaLista(pasos: Exclude<Paso, "confirmar">[], e: EstadoVenta): boolean {
  return pasos.every((p) => pasoCompleto(p, e));
}
