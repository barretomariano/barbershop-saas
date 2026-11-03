"use client";

import { useState } from "react";
import type { Membresia, ModuloNegocio } from "@/lib/tipos";
import type { Destino } from "@/lib/navegacion";
import SelectorPeriodo, { SELECCION_INICIAL, type Seleccion } from "@/components/SelectorPeriodo";
import Tablero from "@/components/Tablero";

// Panorama: el tablero principal con las métricas del período elegido (mismos widgets que el inicio).
export default function Panorama({ yo, equipo, modulos, irA }: { yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; irA: (d: Destino) => void }) {
  const [sel, setSel] = useState<Seleccion>(SELECCION_INICIAL);
  return (
    <section className="flex flex-col gap-4">
      <SelectorPeriodo valor={sel} onCambio={setSel} />
      <Tablero zona="resumen" periodo={sel.periodo} offset={sel.offset} yo={yo} equipo={equipo} modulos={modulos} irA={irA} />
    </section>
  );
}
