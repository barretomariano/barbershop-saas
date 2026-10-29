import { describe, expect, it } from "vitest";
import { ESTADO_INICIAL, pasoAlcanzable, pasosDeVenta, siguientePaso, ventaLista, type EstadoVenta } from "./venta";

const base = (e: Partial<EstadoVenta> = {}): EstadoVenta => ({ ...ESTADO_INICIAL, ...e });

describe("flujo de nueva venta", () => {
  it("con clientes: servicio → pago → cliente → nota; sin clientes se salta el cliente", () => {
    expect(pasosDeVenta(true, false)).toEqual(["servicio", "pago", "cliente", "nota"]);
    expect(pasosDeVenta(false, false)).toEqual(["servicio", "pago", "nota"]);
  });

  it("cobrar un turno solo pide el medio de pago", () => {
    expect(pasosDeVenta(true, true)).toEqual(["pago"]);
  });

  it("empieza en servicio y cada elección habilita el siguiente paso", () => {
    const pasos = pasosDeVenta(true, false);
    let e = base();
    expect(siguientePaso(pasos, e)).toBe("servicio");
    e = base({ servicioId: "s1", monto: "8000" });
    expect(siguientePaso(pasos, e)).toBe("pago");
    e = { ...e, medio: "EFECTIVO" };
    expect(siguientePaso(pasos, e)).toBe("cliente");
    e = { ...e, clienteElegido: true };
    expect(siguientePaso(pasos, e)).toBe("nota");
    e = { ...e, notaHecha: true };
    expect(siguientePaso(pasos, e)).toBe("confirmar");
    expect(ventaLista(pasos, e)).toBe(true);
  });

  it("los pasos posteriores están bloqueados hasta completar los anteriores", () => {
    const pasos = pasosDeVenta(true, false);
    const e = base({ servicioId: "s1", monto: "8000" });
    expect(pasoAlcanzable(pasos, "servicio", e)).toBe(true);
    expect(pasoAlcanzable(pasos, "pago", e)).toBe(true);
    expect(pasoAlcanzable(pasos, "cliente", e)).toBe(false);
    expect(pasoAlcanzable(pasos, "nota", e)).toBe(false);
  });

  it("'Otro monto' exige un monto válido; un monto con centavos no desbloquea nada", () => {
    const pasos = pasosDeVenta(false, false);
    expect(siguientePaso(pasos, base({ otroMonto: true, monto: "" }))).toBe("servicio");
    expect(siguientePaso(pasos, base({ otroMonto: true, monto: "7500,50" }))).toBe("servicio");
    expect(siguientePaso(pasos, base({ otroMonto: true, monto: "7500" }))).toBe("pago");
  });

  it("si se vuelve atrás y se cambia el servicio, el resto se conserva y vuelve a confirmar", () => {
    const pasos = pasosDeVenta(true, false);
    const completo = base({ servicioId: "s1", monto: "8000", medio: "DEBITO", clienteElegido: true, notaHecha: true });
    const cambiado = { ...completo, servicioId: "s2", monto: "12000" };
    expect(siguientePaso(pasos, cambiado)).toBe("confirmar");
  });

  it("sin servicio ni 'otro monto' la venta no está lista aunque haya monto escrito", () => {
    const pasos = pasosDeVenta(false, false);
    expect(ventaLista(pasos, base({ monto: "5000", medio: "EFECTIVO", notaHecha: true }))).toBe(false);
  });
});
