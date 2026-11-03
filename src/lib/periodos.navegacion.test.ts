import { describe, expect, it } from "vitest";
import { anclaDe, diasDelPeriodo, etiquetaPeriodo, opcionesDeSalto, rangoAnterior, rangoPeriodo } from "./periodos";

// 2 de noviembre de 2026, 12:00 hora argentina (15:00 UTC): lunes.
const AHORA = new Date("2026-11-02T15:00:00Z");

describe("navegar por períodos pasados", () => {
  it("offset 0 es el período actual, sin cambios", () => {
    expect(anclaDe("mes", 0, AHORA)).toBe(AHORA);
    expect(etiquetaPeriodo("mes", 0, AHORA)).toBe("Noviembre 2026");
  });
  it("el mes pasado se ve completo: del 1 de octubre al 1 de noviembre (hora argentina)", () => {
    const r = rangoPeriodo("mes", anclaDe("mes", 1, AHORA));
    expect(r.desde).toBe("2026-10-01T03:00:00.000Z");
    expect(r.hasta).toBe("2026-11-01T03:00:00.000Z");
    expect(etiquetaPeriodo("mes", 1, AHORA)).toBe("Octubre 2026");
  });
  it("cruza el año: enero 2026 es 10 meses atrás y diciembre 2025 es 11", () => {
    expect(etiquetaPeriodo("mes", 10, AHORA)).toBe("Enero 2026");
    expect(etiquetaPeriodo("mes", 11, AHORA)).toBe("Diciembre 2025");
    const r = rangoPeriodo("mes", anclaDe("mes", 11, AHORA));
    expect(r.desde).toBe("2025-12-01T03:00:00.000Z");
    expect(r.hasta).toBe("2026-01-01T03:00:00.000Z");
  });
  it("el mes anterior a uno pasado es el mes completo anterior (febrero tiene 28 días en 2026)", () => {
    const ancla = anclaDe("mes", 8, AHORA); // marzo 2026
    expect(etiquetaPeriodo("mes", 8, AHORA)).toBe("Marzo 2026");
    const ant = rangoAnterior("mes", ancla);
    expect(ant.desde).toBe("2026-02-01T03:00:00.000Z");
    expect(ant.hasta).toBe("2026-03-01T03:00:00.000Z");
  });
  it("semana pasada: lunes 26 de octubre a domingo 1 de noviembre", () => {
    const r = rangoPeriodo("semana", anclaDe("semana", 1, AHORA));
    expect(r.desde).toBe("2026-10-26T03:00:00.000Z");
    expect(r.hasta).toBe("2026-11-02T03:00:00.000Z");
    expect(etiquetaPeriodo("semana", 1, AHORA)).toBe("Semana pasada");
    expect(etiquetaPeriodo("semana", 2, AHORA)).toBe("19 oct – 25 oct");
  });
  it("ayer y días anteriores", () => {
    const r = rangoPeriodo("hoy", anclaDe("hoy", 1, AHORA));
    expect(r.desde).toBe("2026-11-01T03:00:00.000Z");
    expect(r.hasta).toBe("2026-11-02T03:00:00.000Z");
    expect(etiquetaPeriodo("hoy", 1, AHORA)).toBe("Ayer");
    expect(etiquetaPeriodo("hoy", 3, AHORA)).toBe("Vie 30 oct");
  });
  it("año pasado completo", () => {
    const r = rangoPeriodo("anio", anclaDe("anio", 1, AHORA));
    expect(r.desde).toBe("2025-01-01T03:00:00.000Z");
    expect(r.hasta).toBe("2026-01-01T03:00:00.000Z");
    expect(etiquetaPeriodo("anio", 1, AHORA)).toBe("2025");
  });
  it("días del período para consultas por día", () => {
    expect(diasDelPeriodo("mes", 0, AHORA)).toEqual({ desde: "2026-11-01", hasta: "2026-11-02" });
    expect(diasDelPeriodo("mes", 1, AHORA)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(diasDelPeriodo("mes", 9, AHORA)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
  it("saltos: 36 meses hacia atrás empezando por el actual", () => {
    const o = opcionesDeSalto("mes", AHORA);
    expect(o).toHaveLength(36);
    expect(o[0]).toEqual({ offset: 0, texto: "Noviembre 2026" });
    expect(o[35].texto).toBe("Diciembre 2023");
  });
});

import { rotuloPasado } from "./periodos";
describe("frases para períodos pasados", () => {
  it("quedan listas para usar en oraciones", () => {
    expect(rotuloPasado("mes", 0, AHORA)).toBeUndefined();
    expect(rotuloPasado("mes", 1, AHORA)).toBe("en octubre 2026");
    expect(rotuloPasado("anio", 1, AHORA)).toBe("en 2025");
    expect(rotuloPasado("hoy", 1, AHORA)).toBe("ayer");
    expect(rotuloPasado("hoy", 3, AHORA)).toBe("el vie 30 oct");
    expect(rotuloPasado("semana", 1, AHORA)).toBe("la semana pasada");
    expect(rotuloPasado("semana", 2, AHORA)).toBe("la semana del 19 oct – 25 oct");
  });
});
