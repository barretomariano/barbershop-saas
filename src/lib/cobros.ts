import type { EstadoCobro, FilaCobro } from "./tipos";
import { sumarDias } from "./turnos";

// Lógica pura de los cobros por día. La plata la calcula la base (dias_cobro, ajuste_cobros, decide_payout);
// acá solo se ordena y se resume lo que ya viene calculado para mostrarlo.

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

export function aFilaCobro(f: Record<string, unknown>): FilaCobro {
  return {
    barber_membership_id: String(f.barber_membership_id), dia: String(f.dia).slice(0, 10), cantidad: num(f.cantidad), vendido: num(f.vendido),
    comision: num(f.comision), estado: String(f.estado) as EstadoCobro,
    monto_cobrado: f.monto_cobrado === null || f.monto_cobrado === undefined ? null : num(f.monto_cobrado),
    entregado: f.entregado === null || f.entregado === undefined ? null : num(f.entregado),
    motivo: f.motivo === null || f.motivo === undefined ? null : String(f.motivo),
  };
}

// "Lunes" para 2026-11-02 (el día de la semana de una fecha AAAA-MM-DD).
export function nombreDia(dia: string): string {
  return DIAS[new Date(`${dia}T12:00:00Z`).getUTCDay()];
}
// "2 nov"
export function fechaCorta(dia: string): string {
  return `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}
// "Hoy", "Ayer" o "Lunes 2 nov"
export function etiquetaDia(dia: string, hoy: string): string {
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  return `${nombreDia(dia)} ${fechaCorta(dia)}`;
}
// "Lunes cobrado"
export function textoCobrado(dia: string): string {
  return `${nombreDia(dia)} cobrado`;
}

// Un día se puede pedir (o marcar cobrado) si tiene comisión y todavía no está cobrado ni pedido.
export const esPedible = (f: FilaCobro) => f.comision > 0 && (f.estado === "SIN_PEDIR" || f.estado === "REJECTED");
// El dueño puede cobrar directo cualquier día con comisión que no esté cobrado.
export const esCobrable = (f: FilaCobro) => f.comision > 0 && f.estado !== "PAID";

export interface ResumenCobros {
  hoy: number; ayer: number;        // comisión de hoy y de ayer
  mes: number;                      // comisión de todos los días del período cargado
  cobrado: number;                  // plata ya entregada en el período
  porPedir: number; diasPorPedir: number;
  pedido: number; diasPedidos: number;
  rechazados: number;
}

export function resumirCobros(filas: FilaCobro[], hoy: string): ResumenCobros {
  const r: ResumenCobros = { hoy: 0, ayer: 0, mes: 0, cobrado: 0, porPedir: 0, diasPorPedir: 0, pedido: 0, diasPedidos: 0, rechazados: 0 };
  const ayer = sumarDias(hoy, -1);
  for (const f of filas) {
    if (f.dia === hoy) r.hoy += f.comision;
    if (f.dia === ayer) r.ayer += f.comision;
    r.mes += f.comision;
    if (f.estado === "PAID") r.cobrado += f.entregado ?? 0;
    else if (f.comision > 0 && f.estado === "REQUESTED") { r.pedido += f.comision; r.diasPedidos += 1; }
    else if (f.comision > 0) { r.porPedir += f.comision; r.diasPorPedir += 1; if (f.estado === "REJECTED") r.rechazados += 1; }
  }
  return r;
}

export interface PedidoDeBarbero { barber_membership_id: string; dias: FilaCobro[]; total: number }

// Para el dueño: los pedidos pendientes agrupados por barbero (el que más pide primero, días de más viejo a más nuevo).
export function pedidosPorBarbero(filas: FilaCobro[]): PedidoDeBarbero[] {
  const mapa = new Map<string, FilaCobro[]>();
  for (const f of filas) {
    if (f.estado !== "REQUESTED") continue;
    mapa.set(f.barber_membership_id, [...(mapa.get(f.barber_membership_id) ?? []), f]);
  }
  return Array.from(mapa, ([id, dias]) => ({
    barber_membership_id: id, dias: [...dias].sort((a, b) => a.dia.localeCompare(b.dia)), total: dias.reduce((t, d) => t + d.comision, 0),
  })).sort((a, b) => b.total - a.total);
}

// Plata que se le va a entregar: la comisión de los días más el ajuste acumulado, nunca menos que 0.
export const aEntregar = (total: number, ajuste: number) => Math.max(0, total + ajuste);

// Aviso del ajuste: negativo = se le entregó de más (venta anulada); positivo = faltó (venta cargada tarde).
export function textoAjuste(ajuste: number, formato: (n: number) => string, primeraPersona: boolean): string | null {
  if (ajuste === 0) return null;
  if (ajuste < 0) return primeraPersona
    ? `Se te entregó ${formato(-ajuste)} de más por una venta anulada: se descuenta en tu próximo cobro.`
    : `Se le entregó ${formato(-ajuste)} de más por una venta anulada: se descuenta en su próximo cobro.`;
  return primeraPersona
    ? `Se cargó una venta de un día ya cobrado: se te suma ${formato(ajuste)} en tu próximo cobro.`
    : `Se cargó una venta de un día ya cobrado: se le suma ${formato(ajuste)} en su próximo cobro.`;
}

// ¿Hay algo nuevo para mirar? Dueño/encargado: pedidos sin decidir. Barbero: alguna decisión posterior a la última vez que miró.
export function hayAvisoCobros(opts: { gestion: boolean; pedidos: number; ultimaDecision: string | null; visto: string | null }): boolean {
  if (opts.gestion) return opts.pedidos > 0;
  if (!opts.ultimaDecision) return false;
  return !opts.visto || opts.ultimaDecision > opts.visto;
}
