import { z } from "zod";
import type { ModuloNegocio, Rol } from "./tipos";

// Catálogo de widgets. Hay dos zonas: "inicio" (lo del día a día, siempre de HOY) y "resumen" (tablero del
// período elegido). En cada zona hay widgets FIJOS (siempre se ven, no se ocultan) y OPCIONALES (la persona
// elige cuáles sumar desde "Más widgets", al final de la pantalla). La base solo guarda la lista de
// opcionales elegidos (public.user_widgets.layout), con ids como "inicio:medios_pago".
export type IdWidget =
  | "ventas" | "ganancia" | "metas" | "por_cobrar" | "turnos_hoy"
  | "por_servicio" | "medios_pago" | "por_barbero" | "comision" | "alertas" | "ticket" | "gastos_cat" | "desglose";

export type Zona = "inicio" | "resumen";
export type Presencia = "fijo" | "opcional";
// "s" ocupa media fila; "l" ocupa la fila completa.
export type Tamano = "s" | "l";

export interface DefWidget {
  id: IdWidget;
  titulo: string;
  descripcion: string;
  roles: Rol[];
  modulo?: ModuloNegocio; // solo aparece si el negocio tiene ese módulo encendido
  tamano: Tamano;
  zonas: Partial<Record<Zona, Presencia>>;
}

const TODOS: Rol[] = ["OWNER", "MANAGER", "BARBER"];
const GESTION: Rol[] = ["OWNER", "MANAGER"];

// El orden de este catálogo es el orden en pantalla.
export const CATALOGO: DefWidget[] = [
  { id: "ventas", titulo: "Ventas", descripcion: "Total vendido y comparación con el período anterior.", roles: TODOS, tamano: "l", zonas: { inicio: "fijo", resumen: "fijo" } },
  { id: "ganancia", titulo: "Ganancia", descripcion: "Lo que te queda a vos o al local.", roles: TODOS, tamano: "s", zonas: { inicio: "fijo", resumen: "fijo" } },
  { id: "por_cobrar", titulo: "Por cobrar", descripcion: "Turnos terminados que faltan cobrar.", roles: TODOS, modulo: "AGENDA", tamano: "s", zonas: { inicio: "fijo" } },
  { id: "turnos_hoy", titulo: "Turnos de hoy", descripcion: "Los turnos del día en orden.", roles: TODOS, modulo: "AGENDA", tamano: "l", zonas: { inicio: "fijo" } },
  { id: "alertas", titulo: "Alertas", descripcion: "Presupuestos, caja sin cerrar y meta.", roles: GESTION, tamano: "l", zonas: { inicio: "fijo", resumen: "opcional" } },
  { id: "metas", titulo: "Meta del mes", descripcion: "Avance de la meta de ventas.", roles: TODOS, tamano: "s", zonas: { inicio: "opcional", resumen: "fijo" } },
  { id: "medios_pago", titulo: "Medios de pago", descripcion: "Cómo pagan los clientes.", roles: TODOS, tamano: "s", zonas: { inicio: "opcional", resumen: "fijo" } },
  { id: "ticket", titulo: "Ticket promedio", descripcion: "Cuánto deja cada venta en promedio.", roles: TODOS, tamano: "s", zonas: { inicio: "opcional", resumen: "fijo" } },
  { id: "desglose", titulo: "Del bruto al neto", descripcion: "Cómo se llega de lo vendido a lo que queda en el local.", roles: GESTION, tamano: "l", zonas: { resumen: "fijo" } },
  { id: "por_servicio", titulo: "Ventas por servicio", descripcion: "Qué servicios se venden más.", roles: TODOS, tamano: "l", zonas: { inicio: "opcional", resumen: "fijo" } },
  { id: "por_barbero", titulo: "Por barbero", descripcion: "Ranking del equipo.", roles: GESTION, tamano: "l", zonas: { inicio: "opcional", resumen: "fijo" } },
  { id: "comision", titulo: "Comisiones por pagar", descripcion: "Lo que falta liquidar (a cada barbero, lo suyo).", roles: TODOS, tamano: "s", zonas: { inicio: "opcional", resumen: "opcional" } },
  { id: "gastos_cat", titulo: "Gastos por categoría", descripcion: "En qué se va la plata del local.", roles: GESTION, tamano: "l", zonas: { resumen: "opcional" } },
];

export const MAX_WIDGETS = 30;

function visible(w: DefWidget, zona: Zona, rol: Rol, modulos: ModuloNegocio[]): boolean {
  return Boolean(w.zonas[zona]) && w.roles.includes(rol) && (!w.modulo || modulos.includes(w.modulo));
}

export function widgetsFijos(zona: Zona, rol: Rol, modulos: ModuloNegocio[]): DefWidget[] {
  return CATALOGO.filter((w) => visible(w, zona, rol, modulos) && w.zonas[zona] === "fijo");
}

export function widgetsOpcionales(zona: Zona, rol: Rol, modulos: ModuloNegocio[]): DefWidget[] {
  return CATALOGO.filter((w) => visible(w, zona, rol, modulos) && w.zonas[zona] === "opcional");
}

// Opcionales que se muestran mientras la persona no haya elegido nada.
export function opcionalesPorDefecto(zona: Zona, rol: Rol, modulos: ModuloNegocio[]): IdWidget[] {
  const base: IdWidget[] = zona === "inicio" ? ["metas"] : [];
  const permitidos = new Set(widgetsOpcionales(zona, rol, modulos).map((w) => w.id));
  return base.filter((id) => permitidos.has(id));
}

const FormaLayout = z.array(z.object({ id: z.string() })).max(MAX_WIDGETS);

// Lo guardado puede estar desactualizado (un módulo apagado, un widget que ya no existe, otro rol, o el
// formato viejo sin zona). Se descarta lo inválido y lo repetido. Una lista vacía elegida a propósito se respeta.
export function sanearElegidos(crudo: unknown, zona: Zona, rol: Rol, modulos: ModuloNegocio[]): IdWidget[] {
  const parsed = FormaLayout.safeParse(crudo);
  if (!parsed.success) return opcionalesPorDefecto(zona, rol, modulos);
  const permitidos = new Set<string>(widgetsOpcionales(zona, rol, modulos).map((w) => w.id));
  const prefijo = `${zona}:`;
  const vistos = new Set<string>();
  const salida: IdWidget[] = [];
  for (const { id } of parsed.data) {
    if (!id.startsWith(prefijo)) continue;
    const corto = id.slice(prefijo.length);
    if (permitidos.has(corto) && !vistos.has(corto)) {
      vistos.add(corto);
      salida.push(corto as IdWidget);
    }
  }
  return salida;
}

// Si lo guardado es de otra versión (sin ninguna entrada con zona), se usa el valor por defecto.
export function tieneFormatoNuevo(crudo: unknown): boolean {
  const parsed = FormaLayout.safeParse(crudo);
  return parsed.success && parsed.data.some((x) => x.id.includes(":"));
}

// Arma lo que se guarda: conserva lo de la otra zona y reemplaza lo de esta.
export function layoutParaGuardar(crudoActual: unknown, zona: Zona, elegidos: IdWidget[]): { id: string }[] {
  const parsed = FormaLayout.safeParse(crudoActual);
  const prefijo = `${zona}:`;
  const otros = parsed.success ? parsed.data.filter((x) => x.id.includes(":") && !x.id.startsWith(prefijo)) : [];
  return [...otros, ...elegidos.map((id) => ({ id: `${prefijo}${id}` }))].slice(0, MAX_WIDGETS);
}

export interface Colocado { id: IdWidget; ancho: 1 | 2 }

// Ordena los widgets según el catálogo y decide cuánto ocupa cada uno: un widget chico que quedaría solo
// en su fila (porque sigue uno grande o es el último) se estira a todo el ancho.
export function acomodar(ids: IdWidget[]): Colocado[] {
  const orden = ids
    .map((id) => CATALOGO.find((w) => w.id === id))
    .filter((w): w is DefWidget => Boolean(w))
    .sort((a, b) => CATALOGO.indexOf(a) - CATALOGO.indexOf(b));
  const salida: Colocado[] = [];
  let pendiente: Colocado | null = null;
  for (const w of orden) {
    if (w.tamano === "l") {
      if (pendiente) { pendiente.ancho = 2; pendiente = null; }
      salida.push({ id: w.id, ancho: 2 });
    } else if (pendiente) {
      pendiente = null;
      salida.push({ id: w.id, ancho: 1 });
    } else {
      const c: Colocado = { id: w.id, ancho: 1 };
      salida.push(c);
      pendiente = c;
    }
  }
  if (pendiente) pendiente.ancho = 2;
  return salida;
}
