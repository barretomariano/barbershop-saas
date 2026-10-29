import { describe, expect, it } from "vitest";
import { alertasDePresupuesto, aCSV, completarDias, describirAuditoria, mejorDiaSemana, nivelPresupuesto, ticketPromedio } from "./gestion";

describe("presupuestos", () => {
  it("niveles", () => {
    expect(nivelPresupuesto(50, 100)).toBe("ok");
    expect(nivelPresupuesto(80, 100)).toBe("cerca");
    expect(nivelPresupuesto(100, 100)).toBe("cerca");
    expect(nivelPresupuesto(101, 100)).toBe("excedido");
    expect(nivelPresupuesto(500, 0)).toBe("ok");
  });
  it("alertas ordenadas con las excedidas primero", () => {
    const a = alertasDePresupuesto(
      [{ category: "INSUMOS", total: 90 }, { category: "ALQUILER", total: 300 }, { category: "OTROS", total: 10 }],
      [{ category: "INSUMOS", amount: 100 }, { category: "ALQUILER", amount: 200 }, { category: "OTROS", amount: 100 }],
    );
    expect(a.map((x) => [x.categoria, x.nivel])).toEqual([["ALQUILER", "excedido"], ["INSUMOS", "cerca"]]);
  });
});

describe("reportes", () => {
  it("ticket promedio", () => {
    expect(ticketPromedio(10000, 3)).toBe(3333);
    expect(ticketPromedio(0, 0)).toBe(0);
  });
  it("mejor día de la semana", () => {
    // 2026-10-26 es lunes, 2026-10-31 es sábado
    const m = mejorDiaSemana([
      { dia: "2026-10-26", cantidad: 1, vendido: 100, para_local: 50 },
      { dia: "2026-10-31", cantidad: 2, vendido: 900, para_local: 450 },
    ]);
    expect(m).toEqual({ dia: 6, vendido: 900 });
    expect(mejorDiaSemana([])).toBeNull();
  });
  it("completa los días sin ventas", () => {
    const r = completarDias([{ dia: "2026-10-02", cantidad: 1, vendido: 10, para_local: 5 }], "2026-10-01", 3);
    expect(r.map((x) => x.vendido)).toEqual([0, 10, 0]);
  });
});

describe("CSV", () => {
  it("usa ; y escapa comillas y saltos", () => {
    expect(aCSV([["a", "b;c"], ['d"e', 2]])).toBe('\uFEFFa;"b;c"\n"d""e";2');
  });
  it("neutraliza fórmulas en texto", () => {
    expect(aCSV([["=1+1", "-5"]])).toBe("\uFEFF'=1+1;'-5");
    expect(aCSV([[-5]])).toBe("\uFEFF-5"); // un número negativo no se toca
  });
});

describe("auditoría", () => {
  it("describe anulaciones y cambios", () => {
    expect(describirAuditoria({ action: "UPDATE", entity: "sales", detail: { status: "CANCELED", cancel_reason: "error" } })).toBe("Venta anulada: error");
    expect(describirAuditoria({ action: "UPDATE", entity: "memberships", detail: { commission_bps: 4000 } })).toBe("Equipo: cambió commission_bps");
    expect(describirAuditoria({ action: "INSERT", entity: "settlements", detail: {} })).toBe("Liquidación: alta");
  });
});
