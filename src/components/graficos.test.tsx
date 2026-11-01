import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BarrasDobles, GraficoArea, MapaCalor, TiraMeses } from "./graficos";
import { matrizCalor } from "@/lib/series";

const f = (n: number) => `$${n}`;

describe("gráficos", () => {
  it("el área dibuja línea, comparación y valores del último punto", () => {
    const html = renderToStaticMarkup(<GraficoArea etiquetas={["L", "M", "X", "J"]} actual={[10, 30, 20, null]} previo={[5, 15, 25, 35]} formato={f} descripcion="d" />);
    expect(html).toContain("stroke-dasharray");
    expect(html).toContain("$20");
    expect(html).not.toContain("NaN");
  });
  it("no se rompe con un solo punto, sin datos o sin comparación", () => {
    for (const [a, p] of [[[5], [null]], [[0, 0, 0], [0, 0, 0]], [[null, null], [null, null]]] as [(number | null)[], (number | null)[]][]) {
      const html = renderToStaticMarkup(<GraficoArea etiquetas={a.map((_, i) => String(i))} actual={a} previo={p} formato={f} descripcion="d" />);
      expect(html).not.toContain("NaN");
    }
  });
  it("las barras dobles dibujan las dos series", () => {
    const html = renderToStaticMarkup(<BarrasDobles etiquetas={["a", "b"]} a={[10, 20]} b={[5, 0]} nombreA="Local" nombreB="Gastos" formato={f} descripcion="d" />);
    expect(html).toContain("var(--par-vivo)");
    expect(html).not.toContain("NaN");
  });
  it("el mapa de calor y la tira de meses se arman con datos vacíos", () => {
    expect(renderToStaticMarkup(<MapaCalor calor={matrizCalor([])} unidad="ventas" />)).not.toContain("NaN");
    expect(renderToStaticMarkup(<TiraMeses meses={[{ etiqueta: "oct", total: 0, actual: true }]} />)).not.toContain("NaN");
  });
});
