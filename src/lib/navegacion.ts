import type { ModuloNegocio, Rol } from "./tipos";

// La app tiene 4 pestañas fijas abajo. Agenda aparece solo si el módulo está encendido.
export type Tab = "inicio" | "agenda" | "resumen" | "ajustes";
export type SubResumen = "panorama" | "ventas" | "reportes" | "caja" | "gastos";
export type SubAjustes = "marca" | "clientes" | "servicios" | "equipo" | "comisiones" | "horarios" | "modulos" | "metas" | "apariencia" | "historial";

// Todo lugar al que puede llevar un widget o un botón.
export type Destino = "inicio" | "agenda" | SubResumen | "resumen" | "ajustes" | SubAjustes;

export interface Ubicacion { tab: Tab; sub: SubResumen | SubAjustes | null }

const RESUMEN: SubResumen[] = ["panorama", "ventas", "reportes", "caja", "gastos"];
const AJUSTES: SubAjustes[] = ["marca", "clientes", "servicios", "equipo", "comisiones", "horarios", "modulos", "metas", "apariencia", "historial"];

export function subResumenDisponibles(rol: Rol): SubResumen[] {
  return rol === "BARBER" ? ["panorama", "ventas", "reportes"] : RESUMEN;
}

export function subAjustesDisponibles(rol: Rol, modulos: ModuloNegocio[]): SubAjustes[] {
  const hayAgenda = modulos.includes("AGENDA");
  const hayClientes = modulos.includes("CLIENTES");
  return AJUSTES.filter((s) => {
    if (s === "clientes") return hayClientes;
    if (s === "horarios") return hayAgenda && rol !== "BARBER";
    if (s === "apariencia") return true;
    if (s === "servicios") return rol !== "BARBER";
    if (s === "marca" || s === "equipo" || s === "comisiones" || s === "modulos" || s === "metas" || s === "historial") return rol === "OWNER";
    return false;
  });
}

// Traduce un destino a pestaña + sección, respetando rol y módulos. Si no corresponde, vuelve al inicio.
export function ubicar(destino: Destino, rol: Rol, modulos: ModuloNegocio[]): Ubicacion {
  if (destino === "inicio") return { tab: "inicio", sub: null };
  if (destino === "agenda") return modulos.includes("AGENDA") ? { tab: "agenda", sub: null } : { tab: "inicio", sub: null };
  if (destino === "resumen") return { tab: "resumen", sub: "panorama" };
  if (destino === "ajustes") return { tab: "ajustes", sub: null };
  if ((RESUMEN as string[]).includes(destino)) {
    return subResumenDisponibles(rol).includes(destino as SubResumen)
      ? { tab: "resumen", sub: destino as SubResumen }
      : { tab: "resumen", sub: "panorama" };
  }
  if (subAjustesDisponibles(rol, modulos).includes(destino as SubAjustes)) return { tab: "ajustes", sub: destino as SubAjustes };
  return { tab: "ajustes", sub: null };
}

export interface ItemTab { id: Tab; texto: string }

export function pestanasVisibles(modulos: ModuloNegocio[]): ItemTab[] {
  return [
    { id: "inicio", texto: "Inicio" },
    ...(modulos.includes("AGENDA") ? [{ id: "agenda" as Tab, texto: "Agenda" }] : []),
    { id: "resumen", texto: "Resumen" },
    { id: "ajustes", texto: "Ajustes" },
  ];
}

// El botón flotante de nueva venta existe solo en Inicio.
export function mostrarBotonVenta(tab: Tab): boolean {
  return tab === "inicio";
}
