import { describe, expect, it } from "vitest";
import { numeroSoporte, urlSoporte } from "./soporte";

describe("soporte por WhatsApp", () => {
  it("deja solo los dígitos y exige un número completo", () => {
    expect(numeroSoporte("+54 9 11 1234-5678")).toBe("5491112345678");
    expect(numeroSoporte("123")).toBeNull();
    expect(numeroSoporte("")).toBeNull();
    expect(numeroSoporte(undefined)).toBeNull();
  });
  it("arma el enlace con el mensaje codificado, o ninguno si no hay número", () => {
    expect(urlSoporte("Hola, necesito ayuda", "5491112345678")).toBe("https://wa.me/5491112345678?text=Hola%2C%20necesito%20ayuda");
    expect(urlSoporte("Hola", null)).toBeNull();
  });
});
