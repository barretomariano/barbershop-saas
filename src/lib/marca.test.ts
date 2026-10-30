import { describe, expect, it } from "vitest";
import { linkBarberia, normalizarSlug, recorteCentrado, slugDeRuta, slugValido, urlLogo } from "./marca";

describe("marca propia", () => {
  it("arma un slug sin acentos ni símbolos", () => {
    expect(normalizarSlug("Barbería El Corte")).toBe("barberia-el-corte");
    expect(normalizarSlug("  ¡Ñandú & Co.!  ")).toBe("nandu-co");
    expect(normalizarSlug("a".repeat(50)).length).toBe(30);
  });
  it("valida el formato igual que la base", () => {
    expect(slugValido("el-corte")).toBe(true);
    expect(slugValido("ab")).toBe(false);
    expect(slugValido("-corte")).toBe(false);
    expect(slugValido("El-Corte")).toBe(false);
    expect(slugValido("el corte")).toBe(false);
  });
  it("arma el link y la dirección del logo", () => {
    expect(linkBarberia("https://app.pages.dev/", "el-corte")).toBe("https://app.pages.dev/b/el-corte");
    expect(urlLogo("https://x.supabase.co/", "id1", 3, 512)).toBe("https://x.supabase.co/storage/v1/object/public/logos/id1/logo-512.png?v=3");
  });
  it("reconoce el slug en la ruta", () => {
    expect(slugDeRuta("/b/el-corte")).toBe("el-corte");
    expect(slugDeRuta("/b/el-corte/manifest.webmanifest")).toBe("el-corte");
    expect(slugDeRuta("/b/El_Corte")).toBeNull();
    expect(slugDeRuta("/otra/ruta")).toBeNull();
  });
  it("recorta al centro sin deformar", () => {
    expect(recorteCentrado(800, 400)).toEqual({ x: 200, y: 0, lado: 400 });
    expect(recorteCentrado(300, 300)).toEqual({ x: 0, y: 0, lado: 300 });
  });
});
