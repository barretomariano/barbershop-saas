"use client";

import type { Membresia, ModuloNegocio } from "@/lib/tipos";
import { subResumenDisponibles, type Destino, type SubResumen } from "@/lib/navegacion";
import { Segmentado } from "@/components/ui";
import Panorama from "@/components/Panorama";
import Resumen from "@/components/Resumen";
import Reportes from "@/components/Reportes";
import Cobros from "@/components/Cobros";
import Gastos from "@/components/Gastos";

const TEXTO: Record<SubResumen, string> = { panorama: "Panorama", ventas: "Ventas", reportes: "Reportes", cobros: "Cobros", gastos: "Gastos" };

// Resumen reúne todo lo que es plata: panorama bruto/neto, historial de ventas, reportes, cobros a barberos y gastos.
export default function ResumenHub({ yo, equipo, modulos, hayClientes, sub, onSub, irA, avisoCobros = false }: {
  yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; hayClientes: boolean; sub: SubResumen; onSub: (s: SubResumen) => void; irA: (d: Destino) => void; avisoCobros?: boolean;
}) {
  const disponibles = subResumenDisponibles(yo.role);
  const actual = disponibles.includes(sub) ? sub : "panorama";
  return (
    <div className="flex flex-col gap-4">
      <Segmentado etiqueta="Secciones del resumen" valor={actual} onCambio={onSub} opciones={disponibles.map((s) => ({ valor: s, texto: s === "cobros" && avisoCobros ? <>{TEXTO[s]}<span className="aviso" aria-label="Novedades" /></> : TEXTO[s] }))} />
      {actual === "panorama" && <Panorama yo={yo} equipo={equipo} modulos={modulos} irA={irA} />}
      {actual === "ventas" && <Resumen yo={yo} equipo={equipo} />}
      {actual === "reportes" && <Reportes yo={yo} hayClientes={hayClientes} />}
      {actual === "cobros" && <Cobros yo={yo} equipo={equipo} />}
      {actual === "gastos" && yo.role !== "BARBER" && <Gastos yo={yo} />}
    </div>
  );
}
