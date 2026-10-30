import { describe, expect, it } from "vitest";
import { calcularImpulso, type EntradaImpulso } from "./impulso";

const base: EntradaImpulso = { hoy: 0, meta: null, mesVendido: 0, dia: 10, totalDias: 30, mejorDia: 0, mismoDiaSemanaPasada: 0, ticket: 10_000 };

describe("impulso para vender más", () => {
  it("sin meta ni historial invita a arrancar", () => {
    const r = calcularImpulso(base);
    expect(r.tono).toBe("arranque");
    expect(r.pct).toBe(0);
  });
  it("meta cumplida celebra y muestra el excedente", () => {
    const r = calcularImpulso({ ...base, meta: 1_000_000, mesVendido: 1_200_000 });
    expect(r.tono).toBe("logro");
    expect(r.detalle).toContain("200.000");
  });
  it("récord: hoy supera el mejor día", () => {
    const r = calcularImpulso({ ...base, hoy: 90_000, mejorDia: 80_000 });
    expect(r.titulo).toBe("¡Es tu mejor día!");
  });
  it("con meta calcula el ritmo diario y los cortes que faltan", () => {
    // faltan 1.000.000 - 400.000 = 600.000 en 21 días (del día 10 al 30) = ~28.571 por día
    const r = calcularImpulso({ ...base, meta: 1_000_000, mesVendido: 400_000 });
    expect(r.objetivoDia).toBe(28_571);
    expect(r.titulo).toContain("28.571");
    expect(r.detalle).toContain("3 ventas más");
  });
  it("con meta y ya en ritmo lo reconoce", () => {
    const r = calcularImpulso({ ...base, meta: 1_000_000, mesVendido: 440_000, hoy: 40_000 });
    expect(r.tono).toBe("logro");
    expect(r.pct).toBe(100);
  });
  it("sin meta compara contra el mejor día", () => {
    const r = calcularImpulso({ ...base, hoy: 30_000, mejorDia: 80_000 });
    expect(r.titulo).toContain("50.000");
    expect(r.pct).toBe(38);
    expect(r.detalle).toContain("5 ventas más");
  });
  it("sin ticket conocido no inventa cantidad de ventas", () => {
    const r = calcularImpulso({ ...base, hoy: 30_000, mejorDia: 80_000, ticket: 0 });
    expect(r.detalle).not.toContain("ventas más");
  });
});
