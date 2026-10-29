"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { PERIODOS, diasDelMes, hoyAR, mesActual, rangoAnterior, rangoPeriodo, type Periodo } from "@/lib/periodos";
import {
  MEDIOS_PAGO, type FilaResumenGastos, type FilaResumenServicio, type FilaResumenVentas,
  type Membresia, type ModuloNegocio, type Turno,
} from "@/lib/tipos";
import { gananciaLocal, progresoMeta, textoVariacion, variacion } from "@/lib/calculos";
import { esPorCerrar, ETIQUETA_ESTADO, horaCorta, nombreCliente, rangoDia } from "@/lib/turnos";
import {
  CATALOGO, layoutParaGuardar, layoutPorDefecto, moverWidget, sanearLayout, widgetsDisponibles, type IdWidget,
} from "@/lib/widgets";
import type { Pestana } from "@/app/page";

interface Props { yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; irA: (p: Pestana) => void }

interface Datos {
  actual: FilaResumenVentas[];
  anterior: FilaResumenVentas[];
  mes: FilaResumenVentas[];
  gastos: FilaResumenGastos[];
  servicios: FilaResumenServicio[];
  fijos: { alquiler: number; sueldos: number };
  meta: number | null;
  turnosHoy: Turno[];
  porCerrar: Turno[];
}

const suma = (f: FilaResumenVentas[], k: "vendido" | "para_barbero" | "para_local" | "cantidad") => f.reduce((s, x) => s + x[k], 0);

export default function Inicio({ yo, equipo, modulos, irA }: Props) {
  const gestion = yo.role !== "BARBER";
  const hayAgenda = modulos.includes("AGENDA");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState<IdWidget[] | null>(null);
  const [editando, setEditando] = useState(false);

  // Disposición guardada de esta persona (si no hay, se usa la de por defecto).
  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("user_widgets").select("layout").eq("business_id", yo.business_id).eq("user_id", yo.user_id).maybeSingle())
      .then(({ data }) => {
        if (!vivo) return;
        const crudo = (data as { layout: unknown } | null)?.layout;
        setLayout(crudo === undefined ? layoutPorDefecto(yo.role, modulos) : sanearLayout(crudo, yo.role, modulos));
      });
    return () => { vivo = false; };
  }, [yo.business_id, yo.user_id, yo.role, modulos]);

  useEffect(() => {
    let vivo = true;
    void cargarDatos(yo, periodo, gestion, hayAgenda).then((r) => {
      if (!vivo) return;
      if (r.error) setError("No se pudieron cargar algunos datos."); else setError(null);
      setDatos(r.datos);
    });
    return () => { vivo = false; };
  }, [yo, periodo, gestion, hayAgenda]);

  const guardarLayout = useCallback(async (ids: IdWidget[]) => {
    setLayout(ids);
    const sb = getSupabase();
    const valor = layoutParaGuardar(ids);
    const { data } = await sb.from("user_widgets").update({ layout: valor })
      .eq("business_id", yo.business_id).eq("user_id", yo.user_id).select("business_id");
    if (!data || data.length === 0) {
      await sb.from("user_widgets").insert({ business_id: yo.business_id, user_id: yo.user_id, layout: valor });
    }
  }, [yo.business_id, yo.user_id]);

  if (layout === null || datos === null) return <p className="texto-suave">Cargando…</p>;

  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <button key={p.valor} onClick={() => setPeriodo(p.valor)} className={`chip ${periodo === p.valor ? "chip-activo" : ""}`}>{p.etiqueta}</button>
          ))}
        </div>
        <button className="text-sm underline" onClick={() => setEditando((v) => !v)}>{editando ? "Listo" : "Personalizar"}</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {editando && <Personalizar rol={yo.role} modulos={modulos} layout={layout} onCambio={guardarLayout} />}

      {layout.length === 0 && !editando && (
        <p className="texto-suave text-sm">No tenés widgets en el inicio. Tocá “Personalizar” para elegirlos.</p>
      )}

      {layout.map((id) => (
        <Widget key={id} id={id} yo={yo} gestion={gestion} periodo={periodo} datos={datos} nombre={nombre} equipo={equipo} irA={irA} />
      ))}
    </section>
  );
}

function Personalizar({ rol, modulos, layout, onCambio }: { rol: Membresia["role"]; modulos: ModuloNegocio[]; layout: IdWidget[]; onCambio: (ids: IdWidget[]) => void }) {
  const disponibles = widgetsDisponibles(rol, modulos);
  const ocultos = disponibles.filter((w) => !layout.includes(w.id));
  const titulo = (id: IdWidget) => CATALOGO.find((w) => w.id === id)?.titulo ?? id;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4 text-sm" style={{ borderColor: "var(--linea)" }}>
      <p className="font-medium">Tu inicio</p>
      <ul className="flex flex-col gap-2">
        {layout.map((id, i) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span>{titulo(id)}</span>
            <span className="flex gap-2">
              <button className="chip" aria-label={`Subir ${titulo(id)}`} disabled={i === 0} onClick={() => onCambio(moverWidget(layout, id, -1))}>↑</button>
              <button className="chip" aria-label={`Bajar ${titulo(id)}`} disabled={i === layout.length - 1} onClick={() => onCambio(moverWidget(layout, id, 1))}>↓</button>
              <button className="chip" onClick={() => onCambio(layout.filter((x) => x !== id))}>Ocultar</button>
            </span>
          </li>
        ))}
      </ul>
      {ocultos.length > 0 && (
        <>
          <p className="texto-suave">Ocultos</p>
          <ul className="flex flex-col gap-2">
            {ocultos.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-2">
                <span>{w.titulo}<span className="texto-suave block text-xs">{w.descripcion}</span></span>
                <button className="chip" onClick={() => onCambio([...layout, w.id])}>Mostrar</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <button className="text-xs underline self-start" onClick={() => onCambio(layoutPorDefecto(rol, modulos))}>Volver al orden original</button>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: "var(--linea)" }}>
      <h2 className="text-sm font-medium texto-suave">{titulo}</h2>
      {children}
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--linea)" }} role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: "var(--acento)" }} />
    </div>
  );
}

interface WProps { id: IdWidget; yo: Membresia; gestion: boolean; periodo: Periodo; datos: Datos; nombre: (id: string) => string; equipo: Membresia[]; irA: (p: Pestana) => void }

function Widget({ id, yo, gestion, periodo, datos, nombre, irA }: WProps) {
  const vendido = suma(datos.actual, "vendido");

  if (id === "ventas") {
    const v = variacion(vendido, suma(datos.anterior, "vendido"));
    return (
      <Tarjeta titulo="Ventas">
        <p className="text-3xl font-semibold">{formatearARS(vendido)}</p>
        <p className="texto-suave text-sm">{suma(datos.actual, "cantidad")} ventas · {textoVariacion(v)}</p>
      </Tarjeta>
    );
  }

  if (id === "ganancia") {
    if (!gestion) {
      return (
        <Tarjeta titulo="Tu ganancia">
          <p className="text-3xl font-semibold">{formatearARS(suma(datos.actual, "para_barbero"))}</p>
          <p className="texto-suave text-sm">De {formatearARS(vendido)} vendidos</p>
        </Tarjeta>
      );
    }
    const g = gananciaLocal({
      vendido, paraLocal: suma(datos.actual, "para_local"), gastos: datos.gastos.reduce((s, x) => s + x.total, 0),
      alquilerSilla: datos.fijos.alquiler, sueldos: datos.fijos.sueldos, incluirFijos: periodo === "mes",
    });
    return (
      <Tarjeta titulo="Ganancia del local">
        <div className="grid grid-cols-2 gap-3">
          <div><p className="texto-suave text-xs">Bruta (todo lo vendido)</p><p className="text-xl font-semibold">{formatearARS(g.bruta)}</p></div>
          <div><p className="texto-suave text-xs">Neta (queda en el local)</p><p className="text-xl font-semibold">{formatearARS(g.neta)}</p></div>
        </div>
        <p className="texto-suave text-xs">
          Neta = parte del local − gastos{g.incluyeFijos ? " + alquileres de silla − sueldos fijos del mes" : ". No incluye alquileres ni sueldos fijos (se suman en “Este mes”)"}.
        </p>
      </Tarjeta>
    );
  }

  if (id === "metas") {
    const mesVendido = suma(datos.mes, "vendido");
    const { dia, total } = diasDelMes();
    if (!datos.meta) {
      return (
        <Tarjeta titulo="Meta del mes">
          <p className="texto-suave text-sm">{yo.role === "OWNER" ? "Todavía no definiste la meta de este mes." : "Todavía no hay una meta cargada para este mes."}</p>
          {yo.role === "OWNER" && <button className="boton-chico self-start" onClick={() => irA("ajustes")}>Definir meta</button>}
        </Tarjeta>
      );
    }
    const p = progresoMeta(mesVendido, datos.meta, dia, total);
    return (
      <Tarjeta titulo="Meta del mes">
        <p className="text-xl font-semibold">{formatearARS(mesVendido)} <span className="texto-suave text-sm font-normal">de {formatearARS(datos.meta)} · {p.pct}%</span></p>
        <Barra pct={p.pct} />
        <p className="texto-suave text-sm">
          {p.alcanzada ? "¡Meta alcanzada!" : `Faltan ${formatearARS(p.faltante)}.`} A este ritmo cerrarías el mes en {formatearARS(p.proyeccion)}.
        </p>
      </Tarjeta>
    );
  }

  if (id === "por_cobrar") {
    return (
      <Tarjeta titulo="Turnos por cobrar">
        {datos.porCerrar.length === 0 ? <p className="texto-suave text-sm">No hay turnos pendientes. 👌</p> : (
          <>
            <p className="text-xl font-semibold">{datos.porCerrar.length}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {datos.porCerrar.slice(0, 3).map((t) => <li key={t.id}>{horaCorta(t.starts_at)} · {nombreCliente(t)} · {nombre(t.barber_membership_id)}</li>)}
            </ul>
            <button className="boton-chico self-start" onClick={() => irA("agenda")}>Ir a cobrar</button>
          </>
        )}
      </Tarjeta>
    );
  }

  if (id === "turnos_hoy") {
    return (
      <Tarjeta titulo="Turnos de hoy">
        {datos.turnosHoy.length === 0 ? <p className="texto-suave text-sm">No hay turnos para hoy.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {datos.turnosHoy.slice(0, 6).map((t) => (
              <li key={t.id} className="flex justify-between gap-2">
                <span>{horaCorta(t.starts_at)} · {nombreCliente(t)}{gestion ? ` · ${nombre(t.barber_membership_id)}` : ""}</span>
                <span className="texto-suave">{ETIQUETA_ESTADO[t.status]}</span>
              </li>
            ))}
          </ul>
        )}
        <button className="text-sm underline self-start" onClick={() => irA("agenda")}>Abrir agenda</button>
      </Tarjeta>
    );
  }

  if (id === "por_servicio") {
    const max = Math.max(1, ...datos.servicios.map((s) => s.vendido));
    return (
      <Tarjeta titulo="Ventas por servicio">
        {datos.servicios.length === 0 ? <p className="texto-suave text-sm">Sin ventas en el período.</p> : (
          <ul className="flex flex-col gap-2 text-sm">
            {datos.servicios.map((s) => (
              <li key={s.service_name} className="flex flex-col gap-1">
                <span className="flex justify-between"><span>{s.service_name} ({s.cantidad})</span><span>{formatearARS(s.vendido)}</span></span>
                <Barra pct={(s.vendido / max) * 100} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    );
  }

  if (id === "medios_pago") {
    const filas = MEDIOS_PAGO.map((m) => ({ ...m, total: datos.actual.filter((f) => f.payment_method === m.valor).reduce((s, f) => s + f.vendido, 0) })).filter((m) => m.total > 0);
    return (
      <Tarjeta titulo="Medios de pago">
        {filas.length === 0 ? <p className="texto-suave text-sm">Sin ventas en el período.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {filas.map((m) => <li key={m.valor} className="flex justify-between"><span>{m.etiqueta}</span><span>{formatearARS(m.total)} · {vendido ? Math.round((m.total / vendido) * 100) : 0}%</span></li>)}
          </ul>
        )}
      </Tarjeta>
    );
  }

  // por_barbero
  const filas = Array.from(new Set(datos.actual.map((f) => f.barber_membership_id)))
    .map((mid) => ({ mid, total: datos.actual.filter((f) => f.barber_membership_id === mid).reduce((s, f) => s + f.vendido, 0), cant: datos.actual.filter((f) => f.barber_membership_id === mid).reduce((s, f) => s + f.cantidad, 0) }))
    .sort((a, b) => b.total - a.total);
  return (
    <Tarjeta titulo="Por barbero">
      {filas.length === 0 ? <p className="texto-suave text-sm">Sin ventas en el período.</p> : (
        <ol className="flex flex-col gap-1 text-sm">
          {filas.map((f, i) => <li key={f.mid} className="flex justify-between"><span>{i + 1}. {nombre(f.mid)} ({f.cant})</span><span>{formatearARS(f.total)}</span></li>)}
        </ol>
      )}
    </Tarjeta>
  );
}

async function cargarDatos(yo: Membresia, periodo: Periodo, gestion: boolean, hayAgenda: boolean): Promise<{ datos: Datos; error: boolean }> {
  const sb = getSupabase();
  const neg = yo.business_id;
  const r = rangoPeriodo(periodo);
  const ant = rangoAnterior(periodo);
  const rMes = rangoPeriodo("mes");
  const ahoraIso = new Date().toISOString();
  const dia = rangoDia(hoyAR());
  const vacio = Promise.resolve({ data: [], error: null });
  let hayError = false;
  const sacar = <T,>(res: { data: unknown; error: unknown }): T[] => {
    if (res.error) { hayError = true; return []; }
    return (res.data as T[]) ?? [];
  };

  const [a, b, m, g, s, f, meta, hoy, cerrar] = await Promise.all([
    sb.rpc("resumen_ventas", { p_business: neg, p_desde: r.desde, p_hasta: r.hasta }),
    sb.rpc("resumen_ventas", { p_business: neg, p_desde: ant.desde, p_hasta: ant.hasta }),
    sb.rpc("resumen_ventas", { p_business: neg, p_desde: rMes.desde, p_hasta: rMes.hasta }),
    gestion ? sb.rpc("resumen_gastos", { p_business: neg, p_desde: r.desde, p_hasta: r.hasta }) : vacio,
    sb.rpc("resumen_por_servicio", { p_business: neg, p_desde: r.desde, p_hasta: r.hasta }),
    gestion ? sb.rpc("fijos_mensuales", { p_business: neg }) : vacio,
    sb.from("sales_goals").select("barber_membership_id,amount").eq("business_id", neg).eq("month", mesActual()),
    hayAgenda && dia
      ? sb.from("appointments").select("*, clients(name,phone)").eq("business_id", neg).gte("starts_at", dia.desde).lt("starts_at", dia.hasta).order("starts_at")
      : vacio,
    hayAgenda
      ? sb.from("appointments").select("*, clients(name,phone)").eq("business_id", neg)
          .or(`status.eq.DONE,and(status.eq.SCHEDULED,ends_at.lte.${ahoraIso})`).order("starts_at").limit(50)
      : vacio,
  ]);

  const metas = sacar<{ barber_membership_id: string | null; amount: number }>(meta);
  const suya = gestion ? metas.find((x) => x.barber_membership_id === null) : metas.find((x) => x.barber_membership_id === yo.id);
  const fijos = sacar<{ alquiler_silla: number; sueldos: number }>(f)[0];
  const turnosHoy = sacar<Turno>(hoy).filter((t) => t.status !== "CANCELED");
  const porCerrar = sacar<Turno>(cerrar).filter((t) => esPorCerrar(t));

  return {
    error: hayError,
    datos: {
      actual: sacar<FilaResumenVentas>(a), anterior: sacar<FilaResumenVentas>(b), mes: sacar<FilaResumenVentas>(m),
      gastos: sacar<FilaResumenGastos>(g), servicios: sacar<FilaResumenServicio>(s),
      fijos: { alquiler: Number(fijos?.alquiler_silla ?? 0), sueldos: Number(fijos?.sueldos ?? 0) },
      meta: suya?.amount ?? null, turnosHoy, porCerrar,
    },
  };
}
