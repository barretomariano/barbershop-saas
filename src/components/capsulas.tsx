"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import { Icono } from "@/components/ui";

// Piezas base del rediseño. Un tablero tiene pocas cápsulas sólidas (como máximo 1 o 2 por pantalla):
//  - "color": relleno del color principal de la barbería (la cifra que más importa).
//  - "tinta": oscura (la cifra que "queda", como la ganancia neta).
//  - "neutra": el resto de las tarjetas, mate y sin color propio.
export type Tono = "neutra" | "color" | "tinta";

function Aros() {
  return (
    <svg className="cap-aros" viewBox="0 0 200 200" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1">
      {[28, 46, 64, 82, 100].map((r) => <circle key={r} cx="150" cy="50" r={r} />)}
    </svg>
  );
}

interface TarjetaProps { titulo: string; ir?: () => void; ancho?: 1 | 2; tono?: Tono; children: ReactNode }

export function Tarjeta({ titulo, ir, ancho = 2, tono = "neutra", children }: TarjetaProps) {
  const clase = `cap cap-${tono} ${tono === "neutra" ? "tarjeta" : ""} ${ir ? "tarjeta-click" : ""} flex flex-col gap-2 w-${ancho}`;
  return (
    <div role={ir ? "link" : undefined} tabIndex={ir ? 0 : undefined} className={clase}
      onClick={ir} onKeyDown={ir ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } } : undefined}>
      {tono !== "neutra" && <Aros />}
      <h2 className="titulo-tarjeta relative">
        <span>{titulo}</span>
        {ir && <span className="cap-flecha" aria-hidden="true"><Icono nombre="diagonal" tam={16} /></span>}
      </h2>
      <div className="relative flex flex-col gap-2">{children}</div>
    </div>
  );
}

export function Barra({ pct, color = "var(--acento-vivo)" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--linea)" }} role="progressbar" aria-valuenow={Math.round(Math.min(100, pct))} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

// Barra de avance de una meta: lo logrado en color y lo que falta rayado, con una perilla de vidrio en el borde.
export function BarraMeta({ pct }: { pct: number }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className="meta-barra" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(p, 4)}%` }} />
      <i style={{ left: `${Math.min(Math.max(p, 4), 96)}%` }} aria-hidden="true" />
    </div>
  );
}

export function Esqueleto({ alto }: { alto: number }) {
  return <div className="esqueleto" style={{ height: alto }} aria-hidden="true" />;
}

// Llama a una función de la base mientras el widget está en pantalla. `convertir` normaliza los números.
export function useRpc<T>(nombre: string, args: Record<string, unknown> | null, convertir: (f: Record<string, unknown>) => T, version = 0): { filas: T[] | null; error: boolean } {
  const clave = JSON.stringify([nombre, args, version]);
  const [estado, setEstado] = useState<{ clave: string; filas: T[]; error: boolean } | null>(null);
  useEffect(() => {
    const [n, a] = JSON.parse(clave) as [string, Record<string, unknown> | null, number];
    if (!a) return;
    let vivo = true;
    void Promise.resolve(getSupabase().rpc(n, a)).then(({ data, error }) => {
      if (!vivo) return;
      setEstado({ clave, filas: error ? [] : ((data as Record<string, unknown>[]) ?? []).map(convertir), error: Boolean(error) });
    });
    return () => { vivo = false; };
    // `convertir` es siempre una función estable definida fuera del componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  if (!args) return { filas: [], error: false };
  return estado && estado.clave === clave ? { filas: estado.filas, error: estado.error } : { filas: null, error: false };
}

export const num = (v: unknown) => Number(v ?? 0);
