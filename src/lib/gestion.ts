import type { CategoriaGasto, EntradaAuditoria, FilaDia } from "./tipos";

// Alertas de presupuesto: avisa al llegar al 80% y al pasarse del 100%.
export type NivelAlerta = "ok" | "cerca" | "excedido";

export function nivelPresupuesto(gastado: number, presupuesto: number): NivelAlerta {
  if (presupuesto <= 0) return "ok";
  if (gastado > presupuesto) return "excedido";
  return gastado >= presupuesto * 0.8 ? "cerca" : "ok";
}

export interface AlertaGasto { categoria: CategoriaGasto; gastado: number; presupuesto: number; nivel: Exclude<NivelAlerta, "ok"> }

export function alertasDePresupuesto(
  gastos: { category: CategoriaGasto; total: number }[],
  presupuestos: { category: CategoriaGasto; amount: number }[],
): AlertaGasto[] {
  const salida: AlertaGasto[] = [];
  for (const p of presupuestos) {
    const gastado = gastos.filter((g) => g.category === p.category).reduce((s, g) => s + g.total, 0);
    const nivel = nivelPresupuesto(gastado, p.amount);
    if (nivel !== "ok") salida.push({ categoria: p.category, gastado, presupuesto: p.amount, nivel });
  }
  return salida.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "excedido" ? -1 : 1));
}

// Ticket promedio de un conjunto de ventas.
export function ticketPromedio(vendido: number, cantidad: number): number {
  return cantidad > 0 ? Math.round(vendido / cantidad) : 0;
}

// Mejor día de la semana (1 = lunes ... 7 = domingo) según lo vendido, a partir de la serie diaria.
export function mejorDiaSemana(serie: FilaDia[]): { dia: number; vendido: number } | null {
  const porDia = new Map<number, number>();
  for (const f of serie) {
    const d = new Date(`${f.dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
    const iso = d === 0 ? 7 : d;
    porDia.set(iso, (porDia.get(iso) ?? 0) + f.vendido);
  }
  let mejor: { dia: number; vendido: number } | null = null;
  for (const [dia, vendido] of porDia) if (!mejor || vendido > mejor.vendido) mejor = { dia, vendido };
  return mejor;
}

// Rellena con ceros los días sin ventas para que el gráfico no tenga huecos.
export function completarDias(serie: FilaDia[], desde: string, cantidadDias: number): FilaDia[] {
  const mapa = new Map(serie.map((f) => [f.dia, f]));
  const salida: FilaDia[] = [];
  const base = new Date(`${desde}T12:00:00Z`);
  for (let i = 0; i < cantidadDias; i++) {
    const d = new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    salida.push(mapa.get(d) ?? { dia: d, cantidad: 0, vendido: 0, para_local: 0 });
  }
  return salida;
}

// CSV compatible con Excel en español (separador ";" y BOM). Se neutralizan celdas que empiezan con = + - @
// para que una planilla no ejecute fórmulas con texto cargado por usuarios.
export function aCSV(filas: (string | number)[][]): string {
  const celda = (v: string | number) => {
    let t = String(v);
    if (/^[=+\-@]/.test(t) && typeof v === "string") t = `'${t}`;
    return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "\uFEFF" + filas.map((f) => f.map(celda).join(";")).join("\n");
}

const ENTIDADES: Record<string, string> = {
  sales: "Venta", expenses: "Gasto", memberships: "Equipo", services: "Servicio", business_modules: "Módulos",
  sales_goals: "Meta", budgets: "Presupuesto", suppliers: "Proveedor", recurring_expenses: "Gasto recurrente",
  cash_closings: "Cierre de caja", settlements: "Liquidación",
};
const ACCIONES: Record<EntradaAuditoria["action"], string> = { INSERT: "Alta", UPDATE: "Cambio", DELETE: "Baja" };

export function describirAuditoria(e: Pick<EntradaAuditoria, "action" | "entity" | "detail">): string {
  const ent = ENTIDADES[e.entity] ?? e.entity;
  if (e.entity === "sales" && e.detail.status === "CANCELED") return `Venta anulada${e.detail.cancel_reason ? `: ${String(e.detail.cancel_reason)}` : ""}`;
  if (e.entity === "expenses" && e.detail.status === "CANCELED") return `Gasto anulado${e.detail.cancel_reason ? `: ${String(e.detail.cancel_reason)}` : ""}`;
  if (e.action === "UPDATE") return `${ent}: cambió ${Object.keys(e.detail).filter((k) => k !== "updated_at").join(", ") || "datos"}`;
  return `${ent}: ${ACCIONES[e.action].toLowerCase()}`;
}
