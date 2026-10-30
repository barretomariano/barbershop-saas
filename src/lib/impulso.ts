import { formatearARS } from "./dinero";

// Mensajes que empujan a vender más: cuánto falta para la meta, para el mejor día y para ir en ritmo.
// Todo se calcula con totales ya traídos de la base; acá solo se combinan y se redactan.
export interface EntradaImpulso {
  hoy: number;               // vendido hoy
  meta: number | null;       // meta del mes (null = sin meta)
  mesVendido: number;        // vendido en el mes hasta ahora (incluye hoy)
  dia: number;               // día del mes (1..31)
  totalDias: number;         // días del mes
  mejorDia: number;          // mejor día de los últimos 90 sin contar hoy (0 = sin historial)
  mismoDiaSemanaPasada: number;
  ticket: number;            // venta promedio (0 = se desconoce)
}

export interface Impulso {
  tono: "logro" | "empuje" | "arranque";
  titulo: string;
  detalle: string;
  objetivoDia: number;       // lo que se mide en la barra
  pct: number;               // avance de hoy hacia ese objetivo (0..100)
  mejorDia: number;
  mismoDiaSemanaPasada: number;
}

const redondear = (n: number) => Math.max(0, Math.round(n));

export function calcularImpulso(e: EntradaImpulso): Impulso {
  const base = { mejorDia: e.mejorDia, mismoDiaSemanaPasada: e.mismoDiaSemanaPasada };
  const pct = (obj: number) => (obj > 0 ? Math.min(100, Math.round((e.hoy / obj) * 100)) : 0);
  const diasRestantes = Math.max(1, e.totalDias - e.dia + 1);
  const cortesPara = (falta: number) => (e.ticket > 0 && falta > 0 ? Math.ceil(falta / e.ticket) : 0);
  const plural = (n: number) => `${n} ${n === 1 ? "venta más" : "ventas más"}`;

  // 1. Meta cumplida: todo lo que se venda es extra.
  if (e.meta && e.mesVendido >= e.meta) {
    return { ...base, tono: "logro", titulo: "¡Meta del mes cumplida!", detalle: `Pasaste la meta por ${formatearARS(e.mesVendido - e.meta)}. Lo que vendas ahora es ganancia extra.`, objetivoDia: e.meta, pct: 100 };
  }
  // 2. Récord: hoy ya superó el mejor día.
  if (e.mejorDia > 0 && e.hoy > e.mejorDia) {
    return { ...base, tono: "logro", titulo: "¡Es tu mejor día!", detalle: `Superaste tu récord anterior de ${formatearARS(e.mejorDia)}. Seguí así.`, objetivoDia: e.hoy, pct: 100 };
  }
  // 3. Con meta: cuánto hay que vender hoy para ir en ritmo.
  if (e.meta) {
    const falta = e.meta - e.mesVendido + e.hoy; // lo que falta contando lo de hoy como parte del reparto
    const porDia = redondear(falta / diasRestantes);
    if (porDia > 0 && e.hoy >= porDia) {
      return { ...base, tono: "logro", titulo: "Hoy vas en ritmo para la meta", detalle: `Ya pasaste los ${formatearARS(porDia)} diarios que necesitás. Cada venta acerca el cierre del mes.`, objetivoDia: porDia, pct: 100 };
    }
    const faltaHoy = porDia - e.hoy;
    const cortes = cortesPara(faltaHoy);
    return {
      ...base, tono: e.hoy === 0 ? "arranque" : "empuje",
      titulo: e.hoy === 0 ? `Hoy apuntá a ${formatearARS(porDia)}` : `Te faltan ${formatearARS(faltaHoy)} hoy`,
      detalle: cortes > 0 ? `Con ${plural(cortes)} vas en ritmo para la meta del mes.` : "Ese es el ritmo diario para llegar a la meta del mes.",
      objetivoDia: porDia, pct: pct(porDia),
    };
  }
  // 4. Sin meta: competir contra el mejor día.
  if (e.mejorDia > 0) {
    const falta = e.mejorDia - e.hoy;
    const cortes = cortesPara(falta);
    return {
      ...base, tono: e.hoy === 0 ? "arranque" : "empuje",
      titulo: e.hoy === 0 ? `Tu mejor día fue de ${formatearARS(e.mejorDia)}` : `Te faltan ${formatearARS(falta)} para tu mejor día`,
      detalle: cortes > 0 ? `Con ${plural(cortes)} lo superás.` : "Estás a un paso de tu récord.",
      objetivoDia: e.mejorDia, pct: pct(e.mejorDia),
    };
  }
  // 5. Sin historial ni meta: invitar a arrancar.
  return { ...base, tono: "arranque", titulo: "Registrá tu primera venta de hoy", detalle: "Cada venta suma. Cuando haya historial te mostramos tu mejor día y tu ritmo.", objetivoDia: 0, pct: 0 };
}
