import { describe, expect, it } from "vitest";
import { contraste, tintaSobre } from "./colores";
import { FONDO_CLARO, FONDO_OSCURO, MARCA_POR_DEFECTO, SUGERENCIAS, SCRIPT_INICIAL, leerMarcaSerializada, marcaValida, resolverTema, serializarMarca, variablesDeMarca, esPrefTema } from "./tema";

// Colores difíciles a propósito: muy claros, muy oscuros, neón y grises.
const EXTREMOS = ["#FFFFFF", "#000000", "#FFFF00", "#0A1A3A", "#D4F51F", "#808080", "#FF00FF", "#00FFFF", "#3B0A0A"];

describe("colores de marca", () => {
  it("con cualquier color elegido, el texto sobre cada relleno se lee (AA 4.5:1)", () => {
    for (const c of [...EXTREMOS, ...SUGERENCIAS.flatMap((s) => [s.marca.principal, s.marca.secundario])]) {
      for (const tema of ["claro", "oscuro"] as const) {
        const v = variablesDeMarca({ principal: c, secundario: c }, tema);
        expect(contraste(v["--acento-vivo"], v["--sobre-vivo"]), `${c} ${tema} sobre vivo`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v["--par-vivo"], v["--sobre-par"]), `${c} ${tema} sobre par`).toBeGreaterThanOrEqual(4.5);
        expect(contraste(v["--acento"], v["--tinta-acento"]), `${c} ${tema} sobre acento`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("el color principal como texto se lee sobre el fondo de cada tema, y el secundario como trazo (3:1)", () => {
    for (const c of EXTREMOS) {
      const claro = variablesDeMarca({ principal: c, secundario: c }, "claro");
      const oscuro = variablesDeMarca({ principal: c, secundario: c }, "oscuro");
      expect(contraste(claro["--acento"], FONDO_CLARO), `${c} texto claro`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(oscuro["--acento"], FONDO_OSCURO), `${c} texto oscuro`).toBeGreaterThanOrEqual(4.5);
      expect(contraste(claro["--par"], FONDO_CLARO), `${c} trazo claro`).toBeGreaterThanOrEqual(3);
      expect(contraste(oscuro["--par"], FONDO_OSCURO), `${c} trazo oscuro`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los rellenos se despegan del fondo: un azul casi negro no desaparece en AMOLED", () => {
    const v = variablesDeMarca({ principal: "#0A1A3A", secundario: "#0A1A3A" }, "oscuro");
    expect(contraste(v["--acento-vivo"], FONDO_OSCURO)).toBeGreaterThanOrEqual(2.4);
    const w = variablesDeMarca({ principal: "#FFFF00", secundario: "#FFFF00" }, "claro");
    expect(contraste(w["--acento-vivo"], FONDO_CLARO)).toBeGreaterThanOrEqual(1.5);
  });

  it("un color que ya se lee no se toca", () => {
    expect(variablesDeMarca({ principal: "#34C796", secundario: "#3E63FF" }, "oscuro")["--acento-vivo"]).toBe("#34C796");
  });

  it("el degradado del modo claro funde el arena con el principal", () => {
    const v = variablesDeMarca(MARCA_POR_DEFECTO, "claro");
    expect(v["--fondo-claro"]).toContain("linear-gradient");
    expect(v["--fondo-claro"]).toContain(FONDO_CLARO);
  });

  it("valida y normaliza lo que viene de afuera", () => {
    expect(marcaValida("#abc", "00ff00")).toEqual({ principal: "#AABBCC", secundario: "#00FF00" });
    expect(marcaValida("rojo", "#00ff00")).toBeNull();
    expect(marcaValida(null, undefined)).toBeNull();
    expect(leerMarcaSerializada(serializarMarca(MARCA_POR_DEFECTO))).toEqual(MARCA_POR_DEFECTO);
    expect(leerMarcaSerializada("basura")).toBeNull();
  });

  it("un color inválido nunca rompe: cae en el de por defecto", () => {
    const v = variablesDeMarca({ principal: "x", secundario: "y" }, "claro");
    expect(v["--acento-vivo"]).toBeTruthy();
  });

  it("tema automático: sigue al sistema; claro y oscuro lo fijan", () => {
    expect(resolverTema("auto", true)).toBe("oscuro");
    expect(resolverTema("auto", false)).toBe("claro");
    expect(resolverTema("claro", true)).toBe("claro");
    expect(resolverTema("oscuro", false)).toBe("oscuro");
    expect(esPrefTema("auto")).toBe(true);
    expect(esPrefTema("sepia")).toBe(false);
  });

  it("el script inicial es JavaScript válido y trae los valores por defecto de ambos temas", () => {
    expect(() => new Function(SCRIPT_INICIAL)).not.toThrow();
    expect(SCRIPT_INICIAL).toContain("--acento-vivo");
  });

  it("las sugerencias no se repiten y son hex válidos", () => {
    expect(new Set(SUGERENCIAS.map((s) => s.id)).size).toBe(SUGERENCIAS.length);
    for (const s of SUGERENCIAS) expect(marcaValida(s.marca.principal, s.marca.secundario)).toEqual(s.marca);
    expect(tintaSobre("#FFFFFF")).toBe("#140F0B");
  });
});
