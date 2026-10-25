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
