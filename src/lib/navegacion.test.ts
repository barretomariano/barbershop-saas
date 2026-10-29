import { describe, expect, it } from "vitest";
import { mostrarBotonVenta, pestanasVisibles, subAjustesDisponibles, subResumenDisponibles, ubicar } from "./navegacion";

describe("navegación", () => {
  it("las pestañas son Inicio, Resumen y Ajustes, y Agenda solo si el módulo está encendido", () => {
    expect(pestanasVisibles([]).map((p) => p.id)).toEqual(["inicio", "resumen", "ajustes"]);
    expect(pestanasVisibles(["AGENDA"]).map((p) => p.id)).toEqual(["inicio", "agenda", "resumen", "ajustes"]);
    expect(pestanasVisibles(["CLIENTES"]).map((p) => p.id)).not.toContain("agenda");
  });

  it("el botón flotante de venta solo existe en Inicio", () => {
    expect(mostrarBotonVenta("inicio")).toBe(true);
    for (const t of ["agenda", "resumen", "ajustes"] as const) expect(mostrarBotonVenta(t)).toBe(false);
  });

  it("Caja y Gastos viven dentro de Resumen, y Clientes dentro de Ajustes", () => {
    expect(ubicar("caja", "OWNER", [])).toEqual({ tab: "resumen", sub: "caja" });
    expect(ubicar("gastos", "MANAGER", [])).toEqual({ tab: "resumen", sub: "gastos" });
    expect(ubicar("clientes", "OWNER", ["CLIENTES"])).toEqual({ tab: "ajustes", sub: "clientes" });
  });

  it("un barbero no llega a Caja ni Gastos: cae en el panorama", () => {
    expect(ubicar("caja", "BARBER", [])).toEqual({ tab: "resumen", sub: "panorama" });
    expect(subResumenDisponibles("BARBER")).toEqual(["panorama", "ventas", "reportes"]);
  });

  it("si el módulo está apagado, el destino vuelve al inicio o a Ajustes", () => {
    expect(ubicar("agenda", "OWNER", [])).toEqual({ tab: "inicio", sub: null });
    expect(ubicar("clientes", "OWNER", [])).toEqual({ tab: "ajustes", sub: null });
    expect(ubicar("metas", "BARBER", [])).toEqual({ tab: "ajustes", sub: null });
  });

  it("qué ve cada rol en Ajustes", () => {
    expect(subAjustesDisponibles("BARBER", ["CLIENTES", "AGENDA"])).toEqual(["clientes", "apariencia"]);
    expect(subAjustesDisponibles("MANAGER", [])).toEqual(["servicios", "apariencia"]);
    const dueno = subAjustesDisponibles("OWNER", ["AGENDA", "CLIENTES"]);
    for (const s of ["clientes", "servicios", "equipo", "comisiones", "horarios", "modulos", "metas", "apariencia", "historial"] as const) expect(dueno).toContain(s);
    expect(subAjustesDisponibles("OWNER", [])).not.toContain("horarios");
  });
});
