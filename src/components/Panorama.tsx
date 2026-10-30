"use client";

import { useState } from "react";
import { PERIODOS, type Periodo } from "@/lib/periodos";
import type { Membresia, ModuloNegocio } from "@/lib/tipos";
import type { Destino } from "@/lib/navegacion";
import { Segmentado } from "@/components/ui";
import Tablero from "@/components/Tablero";

// Panorama: el tablero principal con las métricas del período elegido (mismos widgets que el inicio).
export default function Panorama({ yo, equipo, modulos, irA }: { yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; irA: (d: Destino) => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  return (
    <section className="flex flex-col gap-4">
      <Segmentado etiqueta="Período" valor={periodo} onCambio={setPeriodo}
        opciones={PERIODOS.map((p) => ({ valor: p.valor, texto: p.valor === "semana" ? "7 días" : p.etiqueta.replace("Este ", "") }))} />
      <Tablero zona="resumen" periodo={periodo} yo={yo} equipo={equipo} modulos={modulos} irA={irA} />
    </section>
  );
}
