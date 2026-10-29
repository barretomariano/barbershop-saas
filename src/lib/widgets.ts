import { z } from "zod";
import type { ModuloNegocio, Rol } from "./tipos";

// Catálogo de widgets del inicio. La base solo guarda la lista ordenada de los que cada persona
// quiere ver (public.user_widgets.layout); acá se decide cuáles existen y quién puede verlos.
export type IdWidget =
  | "ventas" | "ganancia" | "metas" | "por_cobrar" | "turnos_hoy"
  | "por_servicio" | "medios_pago" | "por_barbero";

export interface DefWidget {
  id: IdWidget;
  titulo: string;
  descripcion: string;
  roles: Rol[];
  modulo?: ModuloNegocio; // solo aparece si el negocio tiene ese módulo encendido
}

const TODOS: Rol[] = ["OWNER", "MANAGER", "BARBER"];
const GESTION: Rol[] = ["OWNER", "MANAGER"];

export const CATALOGO: DefWidget[] = [
  { id: "ventas", titulo: "Ventas", descripcion: "Total vendido y comparación con el período anterior.", roles: TODOS },
  { id: "ganancia", titulo: "Ganancia", descripcion: "Ganancia bruta y neta del período.", roles: TODOS },
  { id: "metas", titulo: "Meta del mes", descripcion: "Avance de la meta de ventas.", roles: TODOS },
  { id: "por_cobrar", titulo: "Turnos por cobrar", descripcion: "Turnos terminados que faltan cobrar.", roles: TODOS, modulo: "AGENDA" },
  { id: "turnos_hoy", titulo: "Turnos de hoy", descripcion: "Los turnos del día en orden.", roles: TODOS, modulo: "AGENDA" },
  { id: "por_servicio", titulo: "Ventas por servicio", descripcion: "Qué servicios se venden más.", roles: TODOS },
  { id: "medios_pago", titulo: "Medios de pago", descripcion: "Cómo cobran los clientes.", roles: TODOS },
  { id: "por_barbero", titulo: "Por barbero", descripcion: "Ranking del equipo.", roles: GESTION },
];

export const MAX_WIDGETS = 30;

export function widgetsDisponibles(rol: Rol, modulos: ModuloNegocio[]): DefWidget[] {
  return CATALOGO.filter((w) => w.roles.includes(rol) && (!w.modulo || modulos.includes(w.modulo)));
}

export function layoutPorDefecto(rol: Rol, modulos: ModuloNegocio[]): IdWidget[] {
  return widgetsDisponibles(rol, modulos).map((w) => w.id);
}

const FormaLayout = z.array(z.object({ id: z.string() })).max(MAX_WIDGETS);

// Lo que viene de la base puede estar desactualizado (un módulo apagado, un widget que ya no existe,
// un rol distinto). Se descartan los inválidos y los repetidos; si no queda nada válido, se usa el
// orden por defecto. Una lista vacía guardada a propósito (la persona ocultó todo) se respeta.
export function sanearLayout(crudo: unknown, rol: Rol, modulos: ModuloNegocio[]): IdWidget[] {
  const disponibles = new Set<string>(widgetsDisponibles(rol, modulos).map((w) => w.id));
  const parsed = FormaLayout.safeParse(crudo);
  if (!parsed.success) return layoutPorDefecto(rol, modulos);
  const vistos = new Set<string>();
  const salida: IdWidget[] = [];
  for (const { id } of parsed.data) {
    if (disponibles.has(id) && !vistos.has(id)) {
      vistos.add(id);
      salida.push(id as IdWidget);
    }
  }
  return salida;
}

export function layoutParaGuardar(ids: IdWidget[]): { id: IdWidget }[] {
  return ids.map((id) => ({ id }));
}

// Sube (-1) o baja (+1) un widget en la lista, sin salirse de los límites.
export function moverWidget(ids: IdWidget[], id: IdWidget, delta: -1 | 1): IdWidget[] {
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const copia = [...ids];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
