"use client";

import type { Membresia, ModuloNegocio } from "@/lib/tipos";
import type { Destino } from "@/lib/navegacion";
import Tablero from "@/components/Tablero";

interface Props { yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; irA: (d: Destino) => void; refresco?: number }

// El inicio muestra solo lo del día a día (siempre de HOY). Todo lo demás vive en Resumen.
export default function Inicio({ yo, equipo, modulos, irA, refresco = 0 }: Props) {
  return <Tablero zona="inicio" periodo="hoy" yo={yo} equipo={equipo} modulos={modulos} irA={irA} refresco={refresco} />;
}
