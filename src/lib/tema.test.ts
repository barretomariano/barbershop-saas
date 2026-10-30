import { describe, expect, it } from "vitest";
import { ACENTOS, TINTAS, acentoPorId, contraste, esAcento, esTema, variablesDeAcento } from "./tema";

describe("apariencia", () => {
  it("todo acento se lee: el texto sobre el acento tiene contraste AA en ambos temas", () => {
    for (const a of ACENTOS) {
      expect(contraste(a.base, TINTAS.oscura), `${a.id} oscuro`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(a.fuerte, TINTAS.clara), `${a.id} claro`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("el acento se lee también como texto sobre el fondo de cada tema", () => {
    for (const a of ACENTOS) {
      expect(contraste(a.base, "#0D0C0C"), `${a.id} sobre oscuro`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(a.fuerte, "#EFE6DB"), `${a.id} sobre claro`).toBeGreaterThanOrEqual(4);
    }
  });

  it("un acento desconocido cae en el de por defecto (nunca rompe)", () => {
    expect(acentoPorId("rosa-fucsia").id).toBe("brasa");
    expect(acentoPorId(null).id).toBe("brasa");
    expect(esAcento("jade")).toBe(true);
    expect(esAcento("#ff0000")).toBe(false);
    expect(esTema("claro")).toBe(true);
    expect(esTema("sepia")).toBe(false);
  });

  it("genera las variables CSS según el tema", () => {
    expect(variablesDeAcento("jade", "oscuro")["--acento"]).toBe("#34C796");
    expect(variablesDeAcento("jade", "claro")["--acento"]).toBe("#0B7556");
    expect(variablesDeAcento("jade", "claro")["--tinta-acento"]).toBe("#FFFFFF");
  });

  it("los identificadores no se repiten", () => {
    expect(new Set(ACENTOS.map((a) => a.id)).size).toBe(ACENTOS.length);
  });
});
