import { describe, expect, it } from "vitest";
import { formatearARS } from "./dinero";

describe("formatearARS", () => {
  it("formatea un entero como pesos argentinos", () => {
    const texto = formatearARS(12500).replace(/\s/g, " ");
    expect(texto).toContain("12.500");
    expect(texto).toContain("$");
  });

  it("rechaza montos con decimales", () => {
    expect(() => formatearARS(10.5)).toThrow();
  });
});

import { formatearARSReal, getMontosOcultos, MONTO_TAPADO, setMontosOcultos } from "./dinero";
describe("montos ocultos", () => {
  it("tapa los montos y se puede volver a mostrarlos", () => {
    setMontosOcultos(true);
    expect(getMontosOcultos()).toBe(true);
    expect(formatearARS(16000)).toBe(MONTO_TAPADO);
    expect(formatearARSReal(16000)).toContain("16.000");
    setMontosOcultos(false);
    expect(formatearARS(16000)).toContain("16.000");
  });
});
