import { describe, expect, it } from "vitest";
import { asegurarContraste, contraste, extraerColores, mezclar, normalizarHex, tintaSobre } from "./colores";

function imagen(...bloques: [string, number][]): number[] {
  const px: number[] = [];
  for (const [hex, n] of bloques) {
    const v = hex === "transparente" ? [0, 0, 0, 0] : [...[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)), 255];
    for (let i = 0; i < n; i++) px.push(...v);
  }
  return px;
}

describe("colores", () => {
  it("normaliza hex de 3 y 6 dígitos y rechaza lo demás", () => {
    expect(normalizarHex("#f0a")).toBe("#FF00AA");
    expect(normalizarHex(" 12ab34 ")).toBe("#12AB34");
    expect(normalizarHex("#12345")).toBeNull();
    expect(normalizarHex(12)).toBeNull();
  });
  it("mezcla y contraste", () => {
    expect(mezclar("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
  it("elige texto oscuro sobre colores claros y blanco sobre oscuros", () => {
    expect(tintaSobre("#D4F51F")).toBe("#140F0B");
    expect(tintaSobre("#0A1A3A")).toBe("#FFFFFF");
  });
  it("asegurarContraste conserva el color si ya cumple y lo corrige si no", () => {
    expect(asegurarContraste("#FFFFFF", "#000000", 4.5, "aclarar")).toBe("#FFFFFF");
    expect(contraste(asegurarContraste("#222222", "#000000", 4.5, "aclarar"), "#000000")).toBeGreaterThanOrEqual(4.5);
  });
  it("extrae principal y secundario de un logo, ignorando transparente, blanco, negro y gris", () => {
    const r = extraerColores(imagen(["transparente", 500], ["#FFFFFF", 400], ["#000000", 300], ["#808080", 300], ["#D4331F", 200], ["#1F4FD4", 90]));
    expect(r?.principal).toBe("#D4331F");
    expect(r?.secundario).toBe("#1F4FD4");
  });
  it("con un solo color, el secundario es el mismo tono más profundo", () => {
    const r = extraerColores(imagen(["#E8590C", 100]));
    expect(r?.principal).toBe("#E8590C");
    expect(r?.secundario).not.toBe("#E8590C");
    expect(contraste(r!.secundario, "#000000")).toBeGreaterThan(1);
  });
  it("una imagen sin color devuelve null", () => {
    expect(extraerColores(imagen(["#FFFFFF", 100], ["#000000", 100], ["#999999", 100]))).toBeNull();
  });
});
