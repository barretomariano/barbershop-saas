import { describe, expect, it } from "vitest";
import { INICIAL_CABECERA, siguienteCabecera, UMBRAL, type EstadoCabecera } from "./cabecera";

const recorrer = (inicio: EstadoCabecera, posiciones: number[]) => posiciones.reduce(siguienteCabecera, inicio);

describe("cabecera que se esconde al bajar", () => {
  it("no se esconde con un pequeño scroll", () => {
    expect(recorrer(INICIAL_CABECERA, [10, 30, 60]).oculta).toBe(false);
  });
  it("no se esconde enseguida aunque ya se salió de la zona segura", () => {
    expect(recorrer(INICIAL_CABECERA, [60, 100, 120]).oculta).toBe(false);
  });
  it("se esconde después de bajar un buen tramo fuera de la zona segura", () => {
    expect(recorrer(INICIAL_CABECERA, [60, 100, 140, 180, 220]).oculta).toBe(true);
  });
  it("vuelve a aparecer al subir un poco", () => {
    const oculta = recorrer(INICIAL_CABECERA, [100, 200, 300]);
    expect(oculta.oculta).toBe(true);
    expect(recorrer(oculta, [290, 270]).oculta).toBe(false);
  });
  it("un tironcito hacia arriba no la muestra", () => {
    const oculta = recorrer(INICIAL_CABECERA, [100, 200, 300]);
    expect(recorrer(oculta, [295]).oculta).toBe(true);
  });
  it("cerca del tope siempre se ve", () => {
    const oculta = recorrer(INICIAL_CABECERA, [100, 200, 300]);
    expect(recorrer(oculta, [250, 200, 120, UMBRAL.zonaSegura]).oculta).toBe(false);
  });
  it("el rebote de iOS (posición negativa) no la rompe", () => {
    expect(recorrer(INICIAL_CABECERA, [-30, -10, 0]).oculta).toBe(false);
  });
  it("si cambia de dirección se cuenta de nuevo", () => {
    expect(recorrer(INICIAL_CABECERA, [70, 100, 130, 120, 150]).oculta).toBe(false);
  });
});
