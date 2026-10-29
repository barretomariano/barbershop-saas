"use client";

import type { Membresia } from "@/lib/tipos";
import { subResumenDisponibles, type SubResumen } from "@/lib/navegacion";
import { Segmentado } from "@/components/ui";
import Panorama from "@/components/Panorama";
import Resumen from "@/components/Resumen";
import Reportes from "@/components/Reportes";
import Caja from "@/components/Caja";
import Gastos from "@/components/Gastos";

const TEXTO: Record<SubResumen, string> = { panorama: "Panorama", ventas: "Ventas", reportes: "Reportes", caja: "Caja", gastos: "Gastos" };

// Resumen reúne todo lo que es plata: panorama bruto/neto, historial de ventas, reportes, caja y gastos.
export default function ResumenHub({ yo, equipo, hayClientes, sub, onSub }: {
  yo: Membresia; equipo: Membresia[]; hayClientes: boolean; sub: SubResumen; onSub: (s: SubResumen) => void;
}) {
  const disponibles = subResumenDisponibles(yo.role);
  const actual = disponibles.includes(sub) ? sub : "panorama";
  return (
    <div className="flex flex-col gap-4">
      <Segmentado etiqueta="Secciones del resumen" valor={actual} onCambio={onSub} opciones={disponibles.map((s) => ({ valor: s, texto: TEXTO[s] }))} />
      {actual === "panorama" && <Panorama yo={yo} equipo={equipo} />}
      {actual === "ventas" && <Resumen yo={yo} equipo={equipo} />}
      {actual === "reportes" && <Reportes yo={yo} hayClientes={hayClientes} />}
      {actual === "caja" && yo.role !== "BARBER" && <Caja yo={yo} equipo={equipo} />}
      {actual === "gastos" && yo.role !== "BARBER" && <Gastos yo={yo} />}
    </div>
  );
}
