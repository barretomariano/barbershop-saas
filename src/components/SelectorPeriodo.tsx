"use client";

import { useMemo } from "react";
import { etiquetaPeriodo, opcionesDeSalto, type Periodo } from "@/lib/periodos";
import { Icono, Segmentado } from "@/components/ui";

export interface Seleccion { periodo: Periodo; offset: number }
export const SELECCION_INICIAL: Seleccion = { periodo: "hoy", offset: 0 };

const TEXTOS: { valor: Periodo; texto: string }[] = [
  { valor: "hoy", texto: "Hoy" }, { valor: "semana", texto: "Semana" }, { valor: "mes", texto: "Mes" }, { valor: "anio", texto: "Año" },
];
const TOPE: Record<Periodo, number> = { hoy: 365, semana: 104, mes: 36, anio: 5 };

// Período + navegación hacia atrás: ‹ Octubre 2026 ›. En mes y año el nombre del medio abre una lista para saltar directo.
export default function SelectorPeriodo({ valor, onCambio, soloPeriodos }: { valor: Seleccion; onCambio: (s: Seleccion) => void; soloPeriodos?: Periodo[] }) {
  const { periodo, offset } = valor;
  const opciones = useMemo(() => TEXTOS.filter((t) => !soloPeriodos || soloPeriodos.includes(t.valor)), [soloPeriodos]);
  const etiqueta = etiquetaPeriodo(periodo, offset);
  const salto = periodo === "mes" || periodo === "anio" ? opcionesDeSalto(periodo) : null;

  return (
    <div className="flex flex-col gap-2">
      {opciones.length > 1 && <Segmentado etiqueta="Período" valor={periodo} onCambio={(p) => onCambio({ periodo: p, offset: 0 })}
        opciones={opciones.map((o) => ({ valor: o.valor, texto: o.texto }))} />}
      <div className="flex items-center justify-between gap-2">
        <button className="chip" style={{ width: 46, padding: 0, display: "grid", placeItems: "center" }} aria-label="Período anterior"
          disabled={offset >= TOPE[periodo]} onClick={() => onCambio({ periodo, offset: offset + 1 })}>
          <Icono nombre="volver" tam={18} />
        </button>
        {salto ? (
          <select className="campo" style={{ textAlign: "center", textAlignLast: "center", fontWeight: 650, maxWidth: 240 }} aria-label="Elegir período"
            value={offset} onChange={(e) => onCambio({ periodo, offset: Number(e.target.value) })}>
            {salto.map((o) => <option key={o.offset} value={o.offset}>{o.texto}</option>)}
          </select>
        ) : (
          <span className="font-semibold">{etiqueta}</span>
        )}
        <button className="chip" style={{ width: 46, padding: 0, display: "grid", placeItems: "center" }} aria-label="Período siguiente"
          disabled={offset <= 0} onClick={() => onCambio({ periodo, offset: offset - 1 })}>
          <Icono nombre="siguiente" tam={18} />
        </button>
      </div>
    </div>
  );
}
