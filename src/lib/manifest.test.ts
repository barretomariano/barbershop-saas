import { describe, expect, it } from "vitest";
import { construirManifiesto, jsonParaScript, logoParaPagina, nombreCorto } from "./manifest";

const marca = { business_id: "abc", name: "Barbería El Corte", accent: "brasa", logo_version: 2 };

describe("PWA de cada barbería", () => {
  it("el manifiesto usa el nombre, el alcance propio y el logo versionado", () => {
    const m = construirManifiesto("el-corte", marca, "https://x.supabase.co");
    expect(m.name).toBe("Barbería El Corte");
    expect(m.start_url).toBe("/b/el-corte/");
    expect(m.scope).toBe("/b/el-corte/");
    expect(m.icons.map((i) => i.sizes)).toEqual(["192x192", "512x512"]);
    expect(m.icons[0].src).toContain("/logos/abc/logo-192.png?v=2");
  });
  it("sin logo usa los íconos por defecto de la app", () => {
    const m = construirManifiesto("el-corte", { ...marca, logo_version: 0 }, "https://x.supabase.co");
    expect(m.icons[0].src).toBe("/icons/icon-192.png");
    expect(logoParaPagina("el-corte", { ...marca, logo_version: 0 }, "https://x").logo).toBeNull();
  });
  it("nombre corto: entra debajo del ícono", () => {
    expect(nombreCorto("Barbería El Corte")).toBe("Barbería");
    expect(nombreCorto("Don Pepe")).toBe("Don Pepe");
    expect(nombreCorto("Supercalifragilístico Studio")).toBe("Supercalifra");
  });
  it("un nombre malicioso no rompe el script de la página", () => {
    const s = jsonParaScript({ nombre: "</script><script>alert(1)</script>" });
    expect(s).not.toContain("<");
    expect(JSON.parse(s).nombre).toBe("</script><script>alert(1)</script>");
  });
});
