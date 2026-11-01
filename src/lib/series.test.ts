import { describe, expect, it } from "vitest";
import { acumuladoMes, armarSerie, desdeDias, desempeno, margenPct, matrizCalor, mesesRecientes, planSerie, resumenRecurrencia, textoMejorHorario } from "./series";
import type { FilaDia } from "./tipos";

// Sábado 31 de octubre de 2026, 12:00 en Argentina.
const AHORA = new Date("2026-10-31T15:00:00Z");
const dia = (d: string, vendido: number, cantidad = 1): FilaDia => ({ dia: d, vendido, cantidad, para_local: Math.round(vendido / 2) });

describe("planSerie", () => {
  it("hoy: 24 horas, comparadas con ayer", () => {
    const p = planSerie("hoy", AHORA);
    expect(p.etiquetas).toHaveLength(24);
    expect(p.transcurridos).toBe(13);
    expect(p.inicio).toBe("2026-10-31");
    expect(p.inicioAnt).toBe("2026-10-30");
  });
  it("semana: de lunes a domingo; el sábado ya pasaron 6 días", () => {
    const p = planSerie("semana", AHORA);
    expect(p.inicio).toBe("2026-10-26");
    expect(p.inicioAnt).toBe("2026-10-19");
    expect(p.etiquetas).toEqual(["L", "M", "X", "J", "V", "S", "D"]);
    expect(p.transcurridos).toBe(6);
  });
  it("mes: todos los días del mes; el anterior puede ser más corto", () => {
    const p = planSerie("mes", AHORA);
    expect(p.etiquetas).toHaveLength(31);
    expect(p.largoAnt).toBe(30);
    expect(p.inicioAnt).toBe("2026-09-01");
    expect(p.transcurridos).toBe(31);
  });
  it("mes en enero compara con diciembre del año anterior", () => {
    const p = planSerie("mes", new Date("2027-01-10T15:00:00Z"));
    expect(p.inicioAnt).toBe("2026-12-01");
    expect(p.largoAnt).toBe(31);
  });
  it("año: 12 meses contra el año anterior", () => {
    const p = planSerie("anio", AHORA);
    expect(p.inicio).toBe("2026-01-01");
    expect(p.inicioAnt).toBe("2025-01-01");
    expect(p.transcurridos).toBe(10);
  });
});

describe("armarSerie", () => {
  it("alinea punto a punto y corta lo que todavía no pasó", () => {
    const p = planSerie("semana", AHORA);
    const s = armarSerie(p, desdeDias([dia("2026-10-26", 100), dia("2026-10-28", 50)]), desdeDias([dia("2026-10-19", 80), dia("2026-10-25", 30)]));
    expect(s.actual).toEqual([100, 0, 50, 0, 0, 0, null]);
    expect(s.previo).toEqual([80, 0, 0, 0, 0, 0, 30]);
  });
  it("mes: si el anterior es más corto, el resto queda en null", () => {
    const p = planSerie("mes", AHORA);
    const s = armarSerie(p, desdeDias([dia("2026-10-31", 10)]), desdeDias([dia("2026-09-30", 7)]));
    expect(s.actual[30]).toBe(10);
    expect(s.previo[29]).toBe(7);
    expect(s.previo[30]).toBeNull();
  });
  it("año: agrupa por mes", () => {
    const p = planSerie("anio", AHORA);
    const s = armarSerie(p, desdeDias([dia("2026-01-05", 10), dia("2026-01-20", 5), dia("2026-10-01", 3)]), desdeDias([dia("2025-12-31", 9)]));
    expect(s.actual[0]).toBe(15);
    expect(s.actual[9]).toBe(3);
    expect(s.actual[10]).toBeNull();
    expect(s.previo[11]).toBe(9);
  });
  it("ignora días fuera del período", () => {
    const p = planSerie("semana", AHORA);
    const s = armarSerie(p, desdeDias([dia("2026-10-01", 999)]), []);
    expect(s.actual.reduce<number>((t, v) => t + (v ?? 0), 0)).toBe(0);
  });
});

describe("tira de meses", () => {
  it("devuelve los últimos 6 con el actual al final, cruzando el año", () => {
    const m = mesesRecientes([dia("2026-10-05", 10), dia("2026-05-02", 4), dia("2025-12-01", 1)], "2026-10-31");
    expect(m.map((x) => x.etiqueta)).toEqual(["may", "jun", "jul", "ago", "sep", "oct"]);
    expect(m[0].total).toBe(4);
    expect(m[5]).toMatchObject({ total: 10, actual: true });
    expect(mesesRecientes([], "2026-02-10").map((x) => x.etiqueta)).toEqual(["sep", "oct", "nov", "dic", "ene", "feb"]);
  });
  it("acumulado del mes contra el mismo tramo del anterior", () => {
    const serie = [dia("2026-10-03", 100), dia("2026-10-20", 50), dia("2026-09-03", 70), dia("2026-09-25", 500)];
    expect(acumuladoMes(serie, "2026-10-10")).toEqual({ actual: 100, previo: 70 });
  });
});

describe("mapa de calor", () => {
  it("arma la grilla, encuentra el mejor horario y una franja visible con aire", () => {
    const c = matrizCalor([
      { dia_semana: 5, hora: 18, cantidad: 12, vendido: 200 }, { dia_semana: 5, hora: 11, cantidad: 3, vendido: 50 },
      { dia_semana: 1, hora: 15, cantidad: 4, vendido: 60 }, { dia_semana: 9, hora: 3, cantidad: 99, vendido: 1 },
    ]);
    expect(c.max).toBe(12);
    expect(c.total).toBe(19);
    expect(c.mejor).toEqual({ dia: 5, hora: 18, valor: 12 });
    expect(textoMejorHorario(c.mejor)).toBe("Sábado a las 18 h");
    expect(c.horaMin).toBe(10);
    expect(c.horaMax).toBe(19);
  });
  it("sin datos no rompe y muestra una franja razonable", () => {
    const c = matrizCalor([]);
    expect(c.mejor).toBeNull();
    expect(c.horaMax - c.horaMin).toBeGreaterThanOrEqual(7);
    expect(textoMejorHorario(c.mejor)).toBe("Sin datos todavía");
  });
});

describe("recurrencia y desempeño", () => {
  it("calcula el porcentaje que vuelve y tolera datos vacíos", () => {
    expect(resumenRecurrencia({ con_cliente: 40, recurrentes: 14, intervalo_dias: 21.4, dormidos: 3 })).toEqual({ conCliente: 40, recurrentes: 14, pctVuelven: 35, intervalo: 21.4, dormidos: 3 });
    expect(resumenRecurrencia(undefined)).toEqual({ conCliente: 0, recurrentes: 0, pctVuelven: 0, intervalo: null, dormidos: 0 });
  });
  it("margen del local", () => {
    expect(margenPct(1000, 400)).toBe(40);
    expect(margenPct(0, 0)).toBe(0);
  });
  it("desempeño del barbero: cortes por día trabajado, ticket y mejor hora", () => {
    const d = desempeno([dia("2026-10-26", 30000, 3), dia("2026-10-27", 0, 0), dia("2026-10-28", 20000, 2)], [{ hora: 11, cantidad: 1, vendido: 1 }, { hora: 17, cantidad: 4, vendido: 1 }]);
    expect(d).toEqual({ cortes: 5, diasConVentas: 2, cortesPorDia: 2.5, ticket: 10000, mejorHora: 17 });
    expect(desempeno([], []).mejorHora).toBeNull();
  });
});
