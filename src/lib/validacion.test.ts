import { describe, expect, it } from "vitest";
import { explicarMontoInvalido, parsearMonto, porcentajeABps } from "./validacion";
import { rangoPeriodo } from "./periodos";

describe("parsearMonto", () => {
  it("acepta formatos con puntos y símbolo", () => {
    expect(parsearMonto("12.500")).toBe(12500);
    expect(parsearMonto("$ 8000")).toBe(8000);
  });
  it("rechaza vacío, cero y exageraciones", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("0")).toBeNull();
    expect(parsearMonto("1234567890")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
  });
});

describe("parsearMonto: centavos y signos", () => {
  it("rechaza centavos en vez de leerlos como pesos de más", () => {
    expect(parsearMonto("1.500,50")).toBeNull();
    expect(parsearMonto("1500,50")).toBeNull();
    expect(parsearMonto("12.5")).toBeNull();
    expect(parsearMonto("8000,5")).toBeNull();
  });
  it("sigue aceptando separadores de miles", () => {
    expect(parsearMonto("1.500")).toBe(1500);
    expect(parsearMonto("1,500")).toBe(1500);
    expect(parsearMonto("1.234.567")).toBe(1234567);
    expect(parsearMonto(" $ 12.500 ")).toBe(12500);
  });
  it("rechaza montos negativos", () => {
    expect(parsearMonto("-500")).toBeNull();
  });
});

describe("explicarMontoInvalido", () => {
  it("no molesta si está vacío o es válido", () => {
    expect(explicarMontoInvalido("")).toBeNull();
    expect(explicarMontoInvalido("  ")).toBeNull();
    expect(explicarMontoInvalido("12.500")).toBeNull();
  });
  it("explica cuando hay algo escrito pero no sirve", () => {
    expect(explicarMontoInvalido("1.500,50")).toContain("pesos enteros");
    expect(explicarMontoInvalido("abc")).toContain("pesos enteros");
  });
});

describe("porcentajeABps", () => {
  it("convierte porcentaje entero a puntos base", () => {
    expect(porcentajeABps("40")).toBe(4000);
    expect(porcentajeABps("100")).toBe(10000);
    expect(porcentajeABps("0")).toBe(0);
  });
  it("rechaza valores inválidos", () => {
    expect(porcentajeABps("101")).toBeNull();
    expect(porcentajeABps("-5")).toBeNull();
    expect(porcentajeABps("12,5")).toBeNull();
    expect(porcentajeABps("")).toBeNull();
  });
});

describe("rangoPeriodo (hora argentina)", () => {
  // 25/10/2026 17:30 en Argentina = 20:30 UTC
  const ahora = new Date("2026-10-25T20:30:00Z");
  it("hoy empieza a las 00:00 de Argentina (03:00 UTC)", () => {
    expect(rangoPeriodo("hoy", ahora).desde).toBe("2026-10-25T03:00:00.000Z");
  });
  it("semana (domingo 25) arranca el lunes 19", () => {
    expect(rangoPeriodo("semana", ahora).desde).toBe("2026-10-19T03:00:00.000Z");
  });
  it("mes empieza el día 1 a las 00:00 de Argentina", () => {
    expect(rangoPeriodo("mes", ahora).desde).toBe("2026-10-01T03:00:00.000Z");
  });
  it("antes de las 3 UTC todavía es el día anterior en Argentina", () => {
    const madrugada = new Date("2026-10-26T01:00:00Z"); // 22:00 del 25 en Argentina
    expect(rangoPeriodo("hoy", madrugada).desde).toBe("2026-10-25T03:00:00.000Z");
  });
});
