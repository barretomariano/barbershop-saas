import { describe, expect, it } from "vitest";
import { diasDelMes, hoyAR, mesActual, rangoAnterior, rangoPeriodo } from "./periodos";

// 15/10/2026 14:30 hora argentina = 17:30 UTC
const AHORA = new Date("2026-10-15T17:30:00Z");

describe("rangoPeriodo", () => {
  it("hoy empieza a las 00:00 argentinas", () => {
    expect(rangoPeriodo("hoy", AHORA).desde).toBe("2026-10-15T03:00:00.000Z");
  });
  it("este mes empieza el 1", () => {
    expect(rangoPeriodo("mes", AHORA).desde).toBe("2026-10-01T03:00:00.000Z");
  });
  it("este año empieza el 1 de enero", () => {
    expect(rangoPeriodo("anio", AHORA).desde).toBe("2026-01-01T03:00:00.000Z");
  });
  it("semana cubre 7 días contando hoy", () => {
    expect(rangoPeriodo("semana", AHORA).desde).toBe("2026-10-09T03:00:00.000Z");
  });
});

describe("rangoAnterior", () => {
  it("hoy se compara con ayer a la misma hora", () => {
    const r = rangoAnterior("hoy", AHORA);
    expect(r.desde).toBe("2026-10-14T03:00:00.000Z");
    expect(r.hasta).toBe("2026-10-14T17:31:00.000Z");
  });
  it("semana se compara con los 7 días anteriores", () => {
    expect(rangoAnterior("semana", AHORA).desde).toBe("2026-10-02T03:00:00.000Z");
  });
  it("mes se compara con el mismo tramo del mes anterior", () => {
    const r = rangoAnterior("mes", AHORA);
    expect(r.desde).toBe("2026-09-01T03:00:00.000Z");
    expect(r.hasta).toBe("2026-09-15T17:31:00.000Z");
  });
  it("el día 31 se ajusta al último día del mes anterior", () => {
    const r = rangoAnterior("mes", new Date("2026-10-31T15:00:00Z"));
    expect(r.hasta.startsWith("2026-09-30")).toBe(true);
  });
  it("enero se compara con diciembre del año anterior", () => {
    const r = rangoAnterior("mes", new Date("2027-01-10T15:00:00Z"));
    expect(r.desde).toBe("2026-12-01T03:00:00.000Z");
  });
  it("año se compara con el mismo tramo del año anterior", () => {
    const r = rangoAnterior("anio", AHORA);
    expect(r.desde).toBe("2025-01-01T03:00:00.000Z");
    expect(r.hasta).toBe("2025-10-15T17:31:00.000Z");
  });
  it("29 de febrero compara con 28 de febrero del año anterior", () => {
    const r = rangoAnterior("anio", new Date("2028-02-29T15:00:00Z"));
    expect(r.hasta.startsWith("2027-02-28")).toBe(true);
  });
});

describe("fechas auxiliares", () => {
  it("mesActual devuelve el día 1 en hora argentina", () => {
    expect(mesActual(AHORA)).toBe("2026-10-01");
    // 1/11 00:30 UTC todavía es 31/10 en Argentina
    expect(mesActual(new Date("2026-11-01T00:30:00Z"))).toBe("2026-10-01");
  });
  it("hoyAR respeta la hora argentina", () => {
    expect(hoyAR(new Date("2026-11-01T01:00:00Z"))).toBe("2026-10-31");
  });
  it("diasDelMes", () => {
    expect(diasDelMes(AHORA)).toEqual({ dia: 15, total: 31 });
  });
});
