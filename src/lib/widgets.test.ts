import { describe, expect, it } from "vitest";
import { acomodar, layoutParaGuardar, sanearElegidos, tieneFormatoNuevo, widgetsFijos, widgetsOpcionales } from "./widgets";
import { gananciaLocal, progresoMeta, textoVariacion, variacion } from "./calculos";
import { esPorCerrar, fechaHoraAIso, horasDelDia, rangoDia, sumarDias, telefonoParaWhatsApp } from "./turnos";

describe("widgets según zona, rol y módulos", () => {
  it("un barbero no ve el ranking por barbero ni las alertas", () => {
    const ids = [...widgetsFijos("resumen", "BARBER", []), ...widgetsOpcionales("resumen", "BARBER", [])].map((w) => w.id);
    expect(ids).not.toContain("por_barbero");
    expect(ids).not.toContain("alertas");
    expect(widgetsFijos("resumen", "OWNER", []).map((w) => w.id)).toContain("por_barbero");
  });
  it("sin agenda no hay widgets de turnos en el inicio", () => {
    const sin = widgetsFijos("inicio", "OWNER", ["CLIENTES"]).map((w) => w.id);
    expect(sin).not.toContain("turnos_hoy");
    expect(sin).not.toContain("por_cobrar");
    expect(widgetsFijos("inicio", "OWNER", ["AGENDA"]).map((w) => w.id)).toContain("turnos_hoy");
  });
  it("lo fijo y lo opcional nunca se pisan", () => {
    for (const zona of ["inicio", "resumen"] as const) {
      const f = widgetsFijos(zona, "OWNER", ["AGENDA"]).map((w) => w.id);
      const o = widgetsOpcionales(zona, "OWNER", ["AGENDA"]).map((w) => w.id);
      expect(f.filter((x) => o.includes(x))).toEqual([]);
    }
  });
});

describe("sanearElegidos", () => {
  it("descarta desconocidos, repetidos, fijos y no permitidos", () => {
    const crudo = [{ id: "inicio:medios_pago" }, { id: "inicio:medios_pago" }, { id: "inicio:inventado" }, { id: "inicio:por_barbero" }, { id: "inicio:ventas" }, { id: "resumen:ticket" }];
    expect(sanearElegidos(crudo, "inicio", "BARBER", [])).toEqual(["medios_pago"]);
  });
  it("el formato viejo (sin zona) se ignora y no rompe", () => {
    expect(sanearElegidos([{ id: "ventas" }, { id: "metas" }], "inicio", "OWNER", [])).toEqual([]);
    expect(tieneFormatoNuevo([{ id: "ventas" }])).toBe(false);
    expect(tieneFormatoNuevo([{ id: "inicio:metas" }])).toBe(true);
  });
  it("si el formato es inválido usa lo de por defecto; una lista vacía se respeta", () => {
    expect(sanearElegidos({ a: 1 }, "inicio", "OWNER", [])).toEqual(["metas"]);
    expect(sanearElegidos([], "inicio", "OWNER", [])).toEqual([]);
  });
});

describe("layoutParaGuardar", () => {
  it("reemplaza solo la zona pedida y conserva la otra", () => {
    const actual = [{ id: "inicio:metas" }, { id: "resumen:ticket" }];
    expect(layoutParaGuardar(actual, "inicio", ["medios_pago"])).toEqual([{ id: "resumen:ticket" }, { id: "inicio:medios_pago" }]);
    expect(layoutParaGuardar(null, "resumen", [])).toEqual([]);
  });
});

describe("acomodar", () => {
  it("un widget chico que quedaría solo se estira", () => {
    expect(acomodar(["ventas", "ganancia"])).toEqual([{ id: "ventas", ancho: 2 }, { id: "ganancia", ancho: 2 }]);
  });
  it("dos chicos seguidos comparten la fila", () => {
    expect(acomodar(["ganancia", "por_cobrar", "turnos_hoy"])).toEqual([
      { id: "ganancia", ancho: 1 }, { id: "por_cobrar", ancho: 1 }, { id: "turnos_hoy", ancho: 2 },
    ]);
  });
  it("chico seguido de grande se estira; ordena según el catálogo", () => {
    expect(acomodar(["por_servicio", "metas", "ventas"])).toEqual([
      { id: "ventas", ancho: 2 }, { id: "metas", ancho: 2 }, { id: "por_servicio", ancho: 2 },
    ]);
  });
});

describe("cálculos", () => {
  it("variación contra el período anterior", () => {
    expect(variacion(120, 100)).toEqual({ pct: 20, direccion: "sube" });
    expect(variacion(80, 100)).toEqual({ pct: -20, direccion: "baja" });
    expect(variacion(100, 100).direccion).toBe("igual");
    expect(variacion(50, 0).direccion).toBe("sin-base");
    expect(textoVariacion(variacion(120, 100))).toBe("+20% vs. período anterior");
  });
  it("progreso de la meta", () => {
    const p = progresoMeta(500_000, 2_000_000, 10, 30);
    expect(p.pct).toBe(25);
    expect(p.faltante).toBe(1_500_000);
    expect(p.proyeccion).toBe(1_500_000);
    expect(p.alcanzada).toBe(false);
    expect(progresoMeta(2_100_000, 2_000_000, 20, 30).alcanzada).toBe(true);
    expect(progresoMeta(100, 0, 1, 30).pct).toBe(0);
  });
  it("ganancia neta: fijos solo cuando se piden", () => {
    const datos = { vendido: 1_000_000, paraLocal: 400_000, gastos: 150_000, alquilerSilla: 80_000, sueldos: 300_000 };
    expect(gananciaLocal({ ...datos, incluirFijos: false })).toEqual({ bruta: 1_000_000, neta: 250_000, incluyeFijos: false });
    expect(gananciaLocal({ ...datos, incluirFijos: true }).neta).toBe(30_000);
  });
});

describe("turnos", () => {
  it("convierte fecha y hora argentinas a instante", () => {
    expect(fechaHoraAIso("2026-10-30", "15:30")).toBe("2026-10-30T18:30:00.000Z");
    expect(fechaHoraAIso("30/10/2026", "15:30")).toBeNull();
    expect(fechaHoraAIso("2026-10-30", "3pm")).toBeNull();
  });
  it("rango del día argentino", () => {
    expect(rangoDia("2026-10-30")).toEqual({ desde: "2026-10-30T03:00:00.000Z", hasta: "2026-10-31T03:00:00.000Z" });
  });
  it("suma días atravesando el fin de mes", () => {
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01");
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("turno por cerrar", () => {
    const ahora = new Date("2026-10-30T20:00:00Z");
    expect(esPorCerrar({ status: "DONE", ends_at: "2026-10-31T10:00:00Z" }, ahora)).toBe(true);
    expect(esPorCerrar({ status: "SCHEDULED", ends_at: "2026-10-30T19:00:00Z" }, ahora)).toBe(true);
    expect(esPorCerrar({ status: "SCHEDULED", ends_at: "2026-10-30T21:00:00Z" }, ahora)).toBe(false);
    expect(esPorCerrar({ status: "PAID", ends_at: "2026-10-30T19:00:00Z" }, ahora)).toBe(false);
    expect(esPorCerrar({ status: "CANCELED", ends_at: "2026-10-30T19:00:00Z" }, ahora)).toBe(false);
  });
  it("horarios de 15 en 15", () => {
    const h = horasDelDia(9, 10);
    expect(h).toEqual(["09:00", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45"]);
  });
  it("teléfono para WhatsApp", () => {
    expect(telefonoParaWhatsApp("11 5555-1234")).toBe("5491155551234");
    expect(telefonoParaWhatsApp("+54 9 11 5555-1234")).toBe("5491155551234");
    expect(telefonoParaWhatsApp("123")).toBeNull();
  });
});

describe("widgets de gestión", () => {
  it("las alertas son solo para dueño y encargado; la comisión es para todos", () => {
    expect(widgetsFijos("inicio", "BARBER", []).map((w) => w.id)).not.toContain("alertas");
    expect(widgetsFijos("inicio", "MANAGER", []).map((w) => w.id)).toContain("alertas");
    expect(widgetsOpcionales("inicio", "BARBER", []).map((w) => w.id)).toContain("comision");
  });
});
