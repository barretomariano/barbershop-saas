import { describe, expect, it } from "vitest";
import { anioDe, celdasDelMes, conAnio, conMes, maximoDelMes, nivelCarga, ventanaAnios, diasDelMesDe, fechaAR, nombreMes, rangoMes, sumarMeses } from "./calendario";

describe("calendario", () => {
  it("suma meses cruzando el año", () => {
    expect(sumarMeses("2026-12", 1)).toBe("2027-01");
    expect(sumarMeses("2026-01", -1)).toBe("2025-12");
    expect(sumarMeses("2026-10", 0)).toBe("2026-10");
  });

  it("la grilla arranca en lunes y tiene todos los días", () => {
    // 1 de octubre de 2026 es jueves: 3 casillas vacías (lun, mar, mié).
    const c = celdasDelMes("2026-10");
    expect(c.slice(0, 3)).toEqual([null, null, null]);
    expect(c[3]).toBe("2026-10-01");
    expect(c.filter(Boolean)).toHaveLength(31);
    // 1 de junio de 2026 es lunes: sin casillas vacías.
    expect(celdasDelMes("2026-06")[0]).toBe("2026-06-01");
  });

  it("febrero respeta los años bisiestos", () => {
    expect(diasDelMesDe("2028-02")).toBe(29);
    expect(diasDelMesDe("2026-02")).toBe(28);
  });

  it("el rango del mes va de las 00:00 argentinas del día 1 a las del mes siguiente", () => {
    expect(rangoMes("2026-10")).toEqual({ desde: "2026-10-01T03:00:00.000Z", hasta: "2026-11-01T03:00:00.000Z" });
    expect(rangoMes("2026-12")?.hasta).toBe("2027-01-01T03:00:00.000Z");
    expect(rangoMes("octubre")).toBeNull();
  });

  it("un turno a las 23:30 argentinas pertenece a ese día aunque en UTC ya sea el siguiente", () => {
    expect(fechaAR("2026-10-30T02:30:00.000Z")).toBe("2026-10-29");
    expect(fechaAR("2026-10-30T03:00:00.000Z")).toBe("2026-10-30");
  });

  it("nombra el mes en español", () => {
    expect(nombreMes("2026-10")).toBe("octubre de 2026");
  });
});

describe("selector de mes y año", () => {
  it("cambia el año o el mes sin tocar lo demás", () => {
    expect(anioDe("2026-10")).toBe(2026);
    expect(conAnio("2026-10", 2027)).toBe("2027-10");
    expect(conMes("2026-10", 3)).toBe("2026-03");
    expect(conMes("2026-10", 12)).toBe("2026-12");
  });
  it("la ventana de años trae 12 y se desplaza de a 12", () => {
    expect(ventanaAnios(2026)).toEqual([2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033]);
    expect(ventanaAnios(2026, 1)[0]).toBe(2034);
    expect(ventanaAnios(2026, -1)[11]).toBe(2021);
  });
});

describe("carga de cada día", () => {
  it("sin turnos no hay color y el más agendado llega al nivel 4", () => {
    expect(nivelCarga(0, 10)).toBe(0);
    expect(nivelCarga(1, 10)).toBe(1);
    expect(nivelCarga(5, 10)).toBe(2);
    expect(nivelCarga(7, 10)).toBe(3);
    expect(nivelCarga(10, 10)).toBe(4);
  });
  it("en una barbería tranquila 2 turnos no parecen un día lleno", () => {
    const conteo = new Map([["2026-10-05", 2], ["2026-10-06", 1]]);
    expect(maximoDelMes(conteo)).toBe(6);
    expect(nivelCarga(2, maximoDelMes(conteo))).toBe(2);
  });
});
