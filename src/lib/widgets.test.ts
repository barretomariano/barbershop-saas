import { describe, expect, it } from "vitest";
import { layoutPorDefecto, moverWidget, sanearLayout, widgetsDisponibles, type IdWidget } from "./widgets";
import { gananciaLocal, progresoMeta, textoVariacion, variacion } from "./calculos";
import { esPorCerrar, fechaHoraAIso, horasDelDia, rangoDia, sumarDias, telefonoParaWhatsApp } from "./turnos";

describe("widgets según rol y módulos", () => {
  it("un barbero no ve el ranking por barbero", () => {
    expect(widgetsDisponibles("BARBER", []).map((w) => w.id)).not.toContain("por_barbero");
    expect(widgetsDisponibles("OWNER", []).map((w) => w.id)).toContain("por_barbero");
  });
  it("sin agenda no hay widgets de turnos", () => {
    const ids = layoutPorDefecto("OWNER", ["CLIENTES"]);
    expect(ids).not.toContain("turnos_hoy");
    expect(ids).not.toContain("por_cobrar");
    expect(layoutPorDefecto("OWNER", ["AGENDA"])).toContain("turnos_hoy");
  });
});

describe("sanearLayout", () => {
  it("descarta desconocidos, repetidos y no permitidos", () => {
    const crudo = [{ id: "ventas" }, { id: "ventas" }, { id: "inventado" }, { id: "por_barbero" }, { id: "turnos_hoy" }];
    expect(sanearLayout(crudo, "BARBER", [])).toEqual(["ventas"]);
  });
  it("si el formato es inválido vuelve al orden por defecto", () => {
    expect(sanearLayout({ a: 1 }, "OWNER", [])).toEqual(layoutPorDefecto("OWNER", []));
    expect(sanearLayout(null, "OWNER", [])).toEqual(layoutPorDefecto("OWNER", []));
  });
  it("respeta una lista vacía guardada a propósito", () => {
    expect(sanearLayout([], "OWNER", [])).toEqual([]);
  });
});

describe("moverWidget", () => {
  const base: IdWidget[] = ["ventas", "ganancia", "metas"];
  it("sube y baja", () => {
    expect(moverWidget(base, "ganancia", -1)).toEqual(["ganancia", "ventas", "metas"]);
    expect(moverWidget(base, "ganancia", 1)).toEqual(["ventas", "metas", "ganancia"]);
  });
  it("no se sale de los límites", () => {
    expect(moverWidget(base, "ventas", -1)).toEqual(base);
    expect(moverWidget(base, "metas", 1)).toEqual(base);
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
