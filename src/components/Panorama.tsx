"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { PERIODOS, rangoAnterior, rangoPeriodo, type Periodo } from "@/lib/periodos";
import { CATEGORIAS_GASTO, MEDIOS_PAGO, type FilaResumenGastos, type FilaResumenServicio, type FilaResumenVentas, type Membresia } from "@/lib/tipos";
import { gananciaLocal, textoVariacion, variacion } from "@/lib/calculos";
import { Cargando, Segmentado } from "@/components/ui";

interface Datos {
  ventas: FilaResumenVentas[]; anterior: FilaResumenVentas[]; gastos: FilaResumenGastos[]; servicios: FilaResumenServicio[];
  fijos: { alquiler: number; sueldos: number };
}
const suma = (f: FilaResumenVentas[], k: "vendido" | "para_barbero" | "para_local" | "cantidad") => f.reduce((s, x) => s + x[k], 0);

// Todos los números del período en un solo lugar: brutos, netos y desglosados.
export default function Panorama({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const gestion = yo.role !== "BARBER";
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    const r = rangoPeriodo(periodo);
    const ant = rangoAnterior(periodo);
    const args = (x: { desde: string; hasta: string }) => ({ p_business: yo.business_id, p_desde: x.desde, p_hasta: x.hasta });
    const vacio = Promise.resolve({ data: [], error: null });
    void Promise.all([
      sb.rpc("resumen_ventas", args(r)), sb.rpc("resumen_ventas", args(ant)),
      gestion ? sb.rpc("resumen_gastos", args(r)) : vacio,
      sb.rpc("resumen_por_servicio", args(r)),
      gestion ? sb.rpc("fijos_mensuales", { p_business: yo.business_id }) : vacio,
    ]).then(([a, b, g, s, f]) => {
      if (!vivo) return;
      setError(Boolean(a.error || b.error || g.error || s.error || f.error));
      const fijo = ((f.data as { alquiler_silla: number; sueldos: number }[]) ?? [])[0];
      setDatos({
        ventas: (a.data as FilaResumenVentas[]) ?? [], anterior: (b.data as FilaResumenVentas[]) ?? [],
        gastos: (g.data as FilaResumenGastos[]) ?? [], servicios: (s.data as FilaResumenServicio[]) ?? [],
        fijos: { alquiler: Number(fijo?.alquiler_silla ?? 0), sueldos: Number(fijo?.sueldos ?? 0) },
      });
    });
    return () => { vivo = false; };
  }, [yo.business_id, periodo, gestion]);

  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  return (
    <section className="flex flex-col gap-4">
      <Segmentado etiqueta="Período" valor={periodo} onCambio={(p) => { setDatos(null); setPeriodo(p); }}
        opciones={PERIODOS.map((p) => ({ valor: p.valor, texto: p.valor === "semana" ? "7 días" : p.etiqueta.replace("Este ", "") }))} />
      {error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar algunos datos.</p>}
      {datos === null ? <Cargando filas={3} /> : <Contenido d={datos} periodo={periodo} gestion={gestion} nombre={nombre} />}
    </section>
  );
}

function Contenido({ d, periodo, gestion, nombre }: { d: Datos; periodo: Periodo; gestion: boolean; nombre: (id: string) => string }) {
  const bruto = suma(d.ventas, "vendido");
  const paraBarberos = suma(d.ventas, "para_barbero");
  const paraLocal = suma(d.ventas, "para_local");
  const gastos = d.gastos.reduce((s, x) => s + x.total, 0);
  const g = gananciaLocal({ vendido: bruto, paraLocal, gastos, alquilerSilla: d.fijos.alquiler, sueldos: d.fijos.sueldos, incluirFijos: periodo === "mes" });
  const v = variacion(bruto, suma(d.anterior, "vendido"));
  const cantidad = suma(d.ventas, "cantidad");
  const ticket = cantidad ? Math.round(bruto / cantidad) : 0;

  const porMedio = MEDIOS_PAGO.map((m) => ({ etiqueta: m.etiqueta, total: d.ventas.filter((f) => f.payment_method === m.valor).reduce((s, f) => s + f.vendido, 0) })).filter((m) => m.total > 0);
  const porBarbero = Array.from(new Set(d.ventas.map((f) => f.barber_membership_id))).map((id) => {
    const f = d.ventas.filter((x) => x.barber_membership_id === id);
    return { id, cantidad: suma(f, "cantidad"), vendido: suma(f, "vendido"), gana: suma(f, "para_barbero"), local: suma(f, "para_local") };
  }).sort((a, b) => b.vendido - a.vendido);

  return (
    <>
      <div className="tarjeta-orbe flex flex-col gap-1">
        <p className="texto-suave text-sm font-semibold">{gestion ? "Ventas brutas" : "Vendiste"}</p>
        <p className="monto text-5xl">{formatearARS(bruto)}</p>
        <p className="texto-suave text-sm">{cantidad} {cantidad === 1 ? "venta" : "ventas"} · ticket promedio {formatearARS(ticket)}</p>
        <p className="text-sm font-semibold">{textoVariacion(v)}</p>
      </div>

      {gestion ? (
        <div className="tarjeta flex flex-col gap-3">
          <p className="titulo-tarjeta">Del bruto al neto</p>
          <Linea texto="Ventas brutas" valor={bruto} fuerte />
          <Linea texto="Comisiones de barberos" valor={-paraBarberos} />
          <Linea texto="Parte del local" valor={paraLocal} sub />
          <Linea texto="Gastos del período" valor={-gastos} />
          {g.incluyeFijos && <Linea texto="Alquileres de silla" valor={d.fijos.alquiler} />}
          {g.incluyeFijos && <Linea texto="Sueldos fijos" valor={-d.fijos.sueldos} />}
          <div className="flex items-end justify-between border-t pt-3">
            <span className="font-semibold">Ganancia neta del local</span>
            <span className="monto text-2xl" style={{ color: g.neta < 0 ? "var(--peligro)" : "var(--ok)" }}>{formatearARS(g.neta)}</span>
          </div>
          {!g.incluyeFijos && <p className="texto-suave text-xs">Alquileres de silla y sueldos fijos se suman solo en “mes”.</p>}
        </div>
      ) : (
        <div className="tarjeta flex flex-col gap-2">
          <p className="titulo-tarjeta">Tu ganancia</p>
          <p className="monto text-3xl">{formatearARS(paraBarberos)}</p>
          <p className="texto-suave text-sm">De {formatearARS(bruto)} vendidos, esto es lo que te corresponde.</p>
        </div>
      )}

      {gestion && porBarbero.length > 0 && (
        <Lista titulo="Por barbero">
          {porBarbero.map((f) => (
            <Fila key={f.id} izq={`${nombre(f.id)} · ${f.cantidad}`} der={formatearARS(f.vendido)} det={`gana ${formatearARS(f.gana)} · local ${formatearARS(f.local)}`} />
          ))}
        </Lista>
      )}

      <Lista titulo="Por servicio" vacio={d.servicios.length === 0 ? "Sin ventas en el período." : undefined}>
        {d.servicios.map((s) => <Fila key={s.service_name} izq={`${s.service_name} · ${s.cantidad}`} der={formatearARS(s.vendido)} />)}
      </Lista>

      <Lista titulo="Por medio de pago" vacio={porMedio.length === 0 ? "Sin ventas en el período." : undefined}>
        {porMedio.map((m) => <Fila key={m.etiqueta} izq={m.etiqueta} der={`${formatearARS(m.total)} · ${bruto ? Math.round((m.total / bruto) * 100) : 0}%`} />)}
      </Lista>

      {gestion && (
        <Lista titulo="Gastos por categoría" vacio={d.gastos.length === 0 ? "Sin gastos en el período." : undefined}>
          {d.gastos.map((x) => <Fila key={x.category} izq={`${CATEGORIAS_GASTO.find((c) => c.valor === x.category)?.etiqueta ?? x.category} · ${x.cantidad}`} der={formatearARS(x.total)} />)}
        </Lista>
      )}
    </>
  );
}

function Linea({ texto, valor, fuerte, sub }: { texto: string; valor: number; fuerte?: boolean; sub?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px]" style={{ opacity: sub ? 0.7 : 1, paddingLeft: sub ? 12 : 0 }}>
      <span className={fuerte ? "font-semibold" : "texto-suave"}>{texto}</span>
      <span className={`monto ${fuerte ? "text-lg" : "text-base"}`}>{valor < 0 ? "−" : ""}{formatearARS(Math.abs(valor))}</span>
    </div>
  );
}

function Lista({ titulo, children, vacio }: { titulo: string; children: React.ReactNode; vacio?: string }) {
  return (
    <div className="tarjeta flex flex-col gap-3">
      <p className="titulo-tarjeta">{titulo}</p>
      {vacio ? <p className="texto-suave text-sm">{vacio}</p> : <ul className="flex flex-col gap-3">{children}</ul>}
    </div>
  );
}

function Fila({ izq, der, det }: { izq: string; der: string; det?: string }) {
  return (
    <li className="flex flex-col gap-0.5 text-[15px]">
      <span className="flex items-baseline justify-between gap-3"><span className="font-medium">{izq}</span><span className="monto text-base">{der}</span></span>
      {det && <span className="texto-suave text-xs">{det}</span>}
    </li>
  );
}
