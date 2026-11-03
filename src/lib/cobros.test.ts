import { describe, expect, it } from "vitest";
import { aEntregar, aFilaCobro, etiquetaDia, hayAvisoCobros, pedidosPorBarbero, resumirCobros, textoAjuste, textoCobrado, esPedible, esCobrable } from "./cobros";
import type { FilaCobro } from "./tipos";

const f = (o: Partial<FilaCobro>): FilaCobro => ({
  barber_membership_id: "b1", dia: "2026-11-02", cantidad: 3, vendido: 10000, comision: 5000, estado: "SIN_PEDIR", monto_cobrado: null, entregado: null, motivo: null, ...o,
});

describe("cobros por día", () => {
  it("convierte lo que devuelve la base (números como texto, fechas largas)", () => {
    const x = aFilaCobro({ barber_membership_id: "b", dia: "2026-11-02", cantidad: "3", vendido: "10000", comision: "5000", estado: "PAID", monto_cobrado: 5000, entregado: "4000", motivo: null });
    expect(x).toMatchObject({ cantidad: 3, vendido: 10000, comision: 5000, estado: "PAID", monto_cobrado: 5000, entregado: 4000, motivo: null });
  });
  it("nombres de día", () => {
    expect(etiquetaDia("2026-11-02", "2026-11-02")).toBe("Hoy");
    expect(etiquetaDia("2026-11-01", "2026-11-02")).toBe("Ayer");
    expect(etiquetaDia("2026-10-28", "2026-11-02")).toBe("Miércoles 28 oct");
    expect(textoCobrado("2026-11-02")).toBe("Lunes cobrado");
    expect(textoCobrado("2026-11-03")).toBe("Martes cobrado");
  });
  it("qué días se pueden pedir y cobrar", () => {
    expect(esPedible(f({}))).toBe(true);
    expect(esPedible(f({ estado: "REJECTED" }))).toBe(true);
    expect(esPedible(f({ estado: "REQUESTED" }))).toBe(false);
    expect(esPedible(f({ estado: "PAID" }))).toBe(false);
    expect(esPedible(f({ comision: 0 }))).toBe(false);
    expect(esCobrable(f({ estado: "REQUESTED" }))).toBe(true);
    expect(esCobrable(f({ estado: "PAID" }))).toBe(false);
  });
  it("resumen del barbero: hoy, ayer, cobrado, por pedir y pedido", () => {
    const filas = [
      f({ dia: "2026-11-02", comision: 5000 }),
      f({ dia: "2026-11-01", comision: 4000, estado: "REQUESTED" }),
      f({ dia: "2026-10-31", comision: 3000, estado: "PAID", monto_cobrado: 3000, entregado: 2000 }),
      f({ dia: "2026-10-30", comision: 2000, estado: "REJECTED", motivo: "falta un corte" }),
    ];
    expect(resumirCobros(filas, "2026-11-02")).toEqual({
      hoy: 5000, ayer: 4000, mes: 14000, cobrado: 2000, porPedir: 7000, diasPorPedir: 2, pedido: 4000, diasPedidos: 1, rechazados: 1,
    });
  });
  it("pedidos del dueño agrupados por barbero, el que más pide primero", () => {
    const filas = [
      f({ barber_membership_id: "b1", dia: "2026-11-02", comision: 5000, estado: "REQUESTED" }),
      f({ barber_membership_id: "b1", dia: "2026-11-01", comision: 4000, estado: "REQUESTED" }),
      f({ barber_membership_id: "b2", dia: "2026-11-02", comision: 12000, estado: "REQUESTED" }),
      f({ barber_membership_id: "b2", dia: "2026-11-01", comision: 9999, estado: "PAID", entregado: 9999 }),
    ];
    const p = pedidosPorBarbero(filas);
    expect(p.map((x) => [x.barber_membership_id, x.total])).toEqual([["b2", 12000], ["b1", 9000]]);
    expect(p[1].dias.map((d) => d.dia)).toEqual(["2026-11-01", "2026-11-02"]);
  });
  it("lo que se entrega nunca es negativo", () => {
    expect(aEntregar(3000, -4000)).toBe(0);
    expect(aEntregar(5000, -1000)).toBe(4000);
    expect(aEntregar(5000, 500)).toBe(5500);
  });
  it("textos del ajuste", () => {
    const peso = (n: number) => `$${n}`;
    expect(textoAjuste(0, peso, true)).toBeNull();
    expect(textoAjuste(-1000, peso, true)).toContain("$1000 de más");
    expect(textoAjuste(500, peso, false)).toContain("se le suma $500");
  });
  it("punto de aviso: el dueño por pedidos pendientes, el barbero por decisiones nuevas", () => {
    expect(hayAvisoCobros({ gestion: true, pedidos: 2, ultimaDecision: null, visto: null })).toBe(true);
    expect(hayAvisoCobros({ gestion: true, pedidos: 0, ultimaDecision: "2026-11-02T10:00:00Z", visto: null })).toBe(false);
    expect(hayAvisoCobros({ gestion: false, pedidos: 0, ultimaDecision: null, visto: null })).toBe(false);
    expect(hayAvisoCobros({ gestion: false, pedidos: 0, ultimaDecision: "2026-11-02T10:00:00Z", visto: null })).toBe(true);
    expect(hayAvisoCobros({ gestion: false, pedidos: 0, ultimaDecision: "2026-11-02T10:00:00Z", visto: "2026-11-02T11:00:00Z" })).toBe(false);
    expect(hayAvisoCobros({ gestion: false, pedidos: 0, ultimaDecision: "2026-11-02T12:00:00Z", visto: "2026-11-02T11:00:00Z" })).toBe(true);
  });
});
