// Cálculos de presentación para los widgets. Los montos base (ventas, comisiones, gastos) los calcula
// siempre la base de datos; acá solo se comparan y se combinan totales ya calculados.

export interface Variacion { pct: number | null; direccion: "sube" | "baja" | "igual" | "sin-base" }

export function variacion(actual: number, anterior: number): Variacion {
  if (anterior <= 0) return { pct: null, direccion: actual > 0 ? "sin-base" : "igual" };
  const pct = Math.round(((actual - anterior) / anterior) * 100);
  return { pct, direccion: pct > 0 ? "sube" : pct < 0 ? "baja" : "igual" };
}

export function textoVariacion(v: Variacion): string {
  if (v.direccion === "sin-base") return "Sin datos del período anterior";
  if (v.direccion === "igual") return "Igual que el período anterior";
  const signo = (v.pct ?? 0) > 0 ? "+" : "";
  return `${signo}${v.pct}% vs. período anterior`;
}

export interface ProgresoMeta { pct: number; faltante: number; proyeccion: number; alcanzada: boolean }

// Avance de la meta del mes. proyeccion = a este ritmo, cuánto se vendería al cierre del mes.
export function progresoMeta(vendido: number, meta: number, dia: number, totalDias: number): ProgresoMeta {
  const pct = meta > 0 ? Math.round((vendido / meta) * 100) : 0;
  const proyeccion = dia > 0 ? Math.round((vendido / dia) * totalDias) : 0;
  return { pct, faltante: Math.max(0, meta - vendido), proyeccion, alcanzada: meta > 0 && vendido >= meta };
}

export interface Ganancia { bruta: number; neta: number; incluyeFijos: boolean }

// Bruta = todo lo vendido. Neta = lo que queda en el local: su parte de las ventas menos los gastos
// y, solo en el período "mes", más los alquileres de silla y menos los sueldos fijos del mes.
export function gananciaLocal(p: {
  vendido: number; paraLocal: number; gastos: number; alquilerSilla: number; sueldos: number; incluirFijos: boolean;
}): Ganancia {
  const fijos = p.incluirFijos ? p.alquilerSilla - p.sueldos : 0;
  return { bruta: p.vendido, neta: p.paraLocal - p.gastos + fijos, incluyeFijos: p.incluirFijos };
}
