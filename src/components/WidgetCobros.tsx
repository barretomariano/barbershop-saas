"use client";

import { useMemo } from "react";
import { formatearARS } from "@/lib/dinero";
import { hoyAR } from "@/lib/periodos";
import { sumarDias } from "@/lib/turnos";
import { aEntregar, pedidosPorBarbero, resumirCobros } from "@/lib/cobros";
import { Esqueleto, Tarjeta } from "@/components/capsulas";
import { useCobros } from "@/components/useCobros";
import type { VProps } from "@/components/widgetsVisuales";

// Widget principal de Inicio. Barbero: cuánto hizo hoy y ayer y qué le falta cobrar. Dueño/encargado: pedidos para decidir.
export default function WidgetCobros({ yo, gestion, ancho, version, nombre, irA }: VProps) {
  const hoy = useMemo(() => hoyAR(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const { filas, ajustes } = useCobros(yo, sumarDias(hoy, -35), hoy, version);
  if (!filas) return <Tarjeta titulo={gestion ? "Cobros" : "Tu plata"} ancho={ancho}><Esqueleto alto={110} /></Tarjeta>;

  if (!gestion) {
    const r = resumirCobros(filas, hoy);
    const ajuste = ajustes[yo.id] ?? 0;
    const falta = r.porPedir + r.pedido;
    return (
      <Tarjeta titulo="Tu plata" ancho={ancho} tono="color" ir={() => irA("cobros")}>
        <p className="texto-suave text-sm">Hoy hiciste{r.rechazados > 0 && <span className="aviso" aria-label="Hay un cobro rechazado" />}</p>
        <p className="monto">{formatearARS(r.hoy)}</p>
        <div className="flex gap-6 text-sm">
          <span><span className="texto-suave block text-xs">Ayer</span><span className="monto text-lg">{formatearARS(r.ayer)}</span></span>
          <span><span className="texto-suave block text-xs">Te falta cobrar</span><span className="monto text-lg">{formatearARS(Math.max(0, falta + ajuste))}</span></span>
        </div>
        <p className="texto-suave text-xs">
          {r.rechazados > 0 ? "Hay un cobro rechazado: entrá para ver el motivo."
            : r.diasPedidos > 0 ? `${r.diasPedidos} ${r.diasPedidos === 1 ? "día pedido" : "días pedidos"}, esperando al dueño.`
            : r.diasPorPedir > 0 ? "Entrá y pedí cobrar tus días." : "Todo cobrado."}
        </p>
      </Tarjeta>
    );
  }

  const pedidos = pedidosPorBarbero(filas);
  const dias = pedidos.reduce((t, p) => t + p.dias.length, 0);
  const total = pedidos.reduce((t, p) => t + aEntregar(p.total, ajustes[p.barber_membership_id] ?? 0), 0);
  return (
    <Tarjeta titulo="Cobros" ancho={ancho} tono="color" ir={() => irA("cobros")}>
      {dias === 0 ? (
        <>
          <p className="titulo text-[26px] leading-tight">Todo al día</p>
          <p className="texto-suave text-sm">No hay pedidos de cobro para decidir.</p>
        </>
      ) : (
        <>
          <p className="texto-suave text-sm">Piden cobrar<span className="aviso" aria-label="Pedidos pendientes" /></p>
          <p className="monto">{formatearARS(total)}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {pedidos.slice(0, 3).map((p) => (
              <li key={p.barber_membership_id} className="flex justify-between gap-3">
                <span className="truncate">{nombre(p.barber_membership_id)} <span className="texto-suave">· {p.dias.length} {p.dias.length === 1 ? "día" : "días"}</span></span>
                <span className="monto">{formatearARS(p.total)}</span>
              </li>
            ))}
            {pedidos.length > 3 && <li className="texto-suave text-xs">y {pedidos.length - 3} más…</li>}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}
