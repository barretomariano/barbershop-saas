import { describe, expect, it } from "vitest";
import { aEmailDeAcceso, normalizarUsuario } from "./usuario";
import { emailInterno, normalizarUsuario as normalizarEnServidor } from "../../supabase/functions/gestionar-equipo/index";

describe("aEmailDeAcceso", () => {
  it("un email completo se deja como está", () => {
    expect(aEmailDeAcceso(" dueno@gmail.com ", "equipo.invalid")).toBe("dueno@gmail.com");
  });
  it("un usuario se convierte al email interno en minúsculas", () => {
    expect(aEmailDeAcceso(" Juan.Perez ", "equipo.invalid")).toBe("juan.perez@equipo.invalid");
  });
  it("coincide con el email que crea la función del servidor", () => {
    expect(aEmailDeAcceso("juan.perez", "equipo.invalid")).toBe(emailInterno("juan.perez", "equipo.invalid"));
  });
});

describe("normalizarUsuario (pantalla y servidor usan la misma regla)", () => {
  const casos = ["juan", "Juan.Perez", "  ab ", "a b", "juan@x", "ñandú", "x".repeat(31), "x".repeat(30), "a-b_c.1", ""];
  it.each(casos)("caso %j", (c) => {
    expect(normalizarUsuario(c)).toBe(normalizarEnServidor(c));
  });
});
