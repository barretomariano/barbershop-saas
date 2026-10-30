"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { diasDelMes, hoyAR, mesActual, rangoAnterior, rangoPeriodo, type Periodo } from "@/lib/periodos";
import {
  CATEGORIAS_GASTO, MEDIOS_PAGO, type FilaPendiente, type FilaResumenGastos, type FilaResumenServicio, type FilaResumenVentas,
  type FilaDia, type Membresia, type ModuloNegocio, type Presupuesto, type Turno,
} from "@/lib/tipos";
import { alertasDePresupuesto } from "@/lib/gestion";
import { gananciaLocal, progresoMeta, variacion, type Variacion } from "@/lib/calculos";
import { calcularImpulso } from "@/lib/impulso";
import { esPorCerrar, ETIQUETA_ESTADO, horaCorta, nombreCliente, rangoDia, sumarDias } from "@/lib/turnos";
import {
  acomodar, layoutParaGuardar, sanearElegidos, tieneFormatoNuevo, widgetsFijos, widgetsOpcionales, opcionalesPorDefecto,
  type IdWidget, type Zona,
} from "@/lib/widgets";
import type { Destino } from "@/lib/navegacion";
import { Anillo, Cargando, EncabezadoHoja, Hoja, Icono } from "@/components/ui";

interface Props {
  zona: Zona; periodo: Periodo; yo: Membresia; equipo: Membresia[]; modulos: ModuloNegocio[]; irA: (d: Destino) => void; refresco?: number;
}

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
  pendiente: FilaPendiente[];
  gastosMes: FilaResumenGastos[];
  presupuestos: Presupuesto[];
  cajaAyerSinCerrar: boolean;
  ahora: number; // instante en que se cargaron los datos
  serie: FilaDia[]; // ventas por día de los últimos 90 días (para el impulso)
}

const suma = (f: FilaResumenVentas[], k: "vendido" | "para_barbero" | "para_local" | "cantidad") => f.reduce((s, x) => s + x[k], 0);
const COMPARA: Record<Periodo, string> = { hoy: "que ayer", semana: "que los 7 días anteriores", mes: "que el mes anterior", anio: "que el año anterior" };
const NOMBRE: Record<Periodo, string> = { hoy: "hoy", semana: "en los últimos 7 días", mes: "este mes", anio: "este año" };
const COLORES = ["var(--acento)", "var(--par)", "var(--ok)", "color-mix(in srgb, var(--acento) 45%, #fff)", "var(--suave)"];

function textoComparacion(v: Variacion, p: Periodo): string {
  if (v.direccion === "sin-base") return "Sin datos para comparar";
  if (v.direccion === "igual") return `Igual ${COMPARA[p]}`;
  const pct = v.pct ?? 0;
  return `${pct > 0 ? "+" : ""}${pct}% ${pct > 0 ? "más" : "menos"} ${COMPARA[p]}`;
}

export default function Tablero({ zona, periodo, yo, equipo, modulos, irA, refresco = 0 }: Props) {
  const gestion = yo.role !== "BARBER";
  const hayAgenda = modulos.includes("AGENDA");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [crudo, setCrudo] = useState<unknown>(undefined); // lo guardado en user_widgets (ambas zonas)
  const [cargadoLayout, setCargadoLayout] = useState(false);
  const [elegiendo, setElegiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("user_widgets").select("layout").eq("business_id", yo.business_id).eq("user_id", yo.user_id).maybeSingle())
      .then(({ data }) => {
        if (!vivo) return;
        setCrudo((data as { layout: unknown } | null)?.layout);
        setCargadoLayout(true);
      });
    return () => { vivo = false; };
  }, [yo.business_id, yo.user_id]);

  useEffect(() => {
    let vivo = true;
    void cargarDatos(yo, periodo, gestion, hayAgenda, zona === "inicio").then((r) => {
      if (!vivo) return;
      setError(r.error ? "No se pudieron cargar algunos datos." : null);
      setDatos(r.datos);
    });
    return () => { vivo = false; };
  }, [yo, periodo, gestion, hayAgenda, zona, refresco]);

  // Si la persona nunca eligió nada con el formato nuevo, se muestran los opcionales por defecto.
  const elegidos: IdWidget[] = crudo === undefined || !tieneFormatoNuevo(crudo)
    ? opcionalesPorDefecto(zona, yo.role, modulos)
    : sanearElegidos(crudo, zona, yo.role, modulos);

  const guardar = useCallback(async (ids: IdWidget[]) => {
    const valor = layoutParaGuardar(crudo, zona, ids);
    setCrudo(valor);
    const sb = getSupabase();
    const { data } = await sb.from("user_widgets").update({ layout: valor })
      .eq("business_id", yo.business_id).eq("user_id", yo.user_id).select("business_id");
    if (!data || data.length === 0) {
      await sb.from("user_widgets").insert({ business_id: yo.business_id, user_id: yo.user_id, layout: valor });
    }
  }, [crudo, zona, yo.business_id, yo.user_id]);

  if (!cargadoLayout || datos === null) return <Cargando filas={3} />;

  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";
  const ids = [...widgetsFijos(zona, yo.role, modulos).map((w) => w.id), ...elegidos];
  const opcionales = widgetsOpcionales(zona, yo.role, modulos);

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <div className="tablero">
        {acomodar(ids).map(({ id, ancho }) => (
          <Widget key={id} id={id} ancho={ancho} zona={zona} yo={yo} gestion={gestion} periodo={periodo} datos={datos} nombre={nombre} irA={irA} />
        ))}
      </div>

      {opcionales.length > 0 && (
        <button className="agregar-widgets" onClick={() => setElegiendo(true)}>
          <Icono nombre="mas" tam={18} /> Más widgets
        </button>
      )}

      {elegiendo && (
        <Hoja titulo="Más widgets" onCerrar={() => setElegiendo(false)}>
          <EncabezadoHoja titulo="Más widgets" detalle="Los principales siempre se ven. Sumá los que quieras tener a mano." onCerrar={() => setElegiendo(false)} />
          <ul className="flex flex-col gap-2">
            {opcionales.map((w) => {
              const activo = elegidos.includes(w.id);
              return (
                <li key={w.id} className="flex items-center justify-between gap-3 rounded-[18px] p-3" style={{ background: "var(--sup-2)" }}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{w.titulo}</span>
                    <span className="texto-suave block text-xs">{w.descripcion}</span>
                  </span>
                  <button className={activo ? "chip" : "boton-chico"} onClick={() => void guardar(activo ? elegidos.filter((x) => x !== w.id) : [...elegidos, w.id])}>
                    {activo ? "Quitar" : "Agregar"}
                  </button>
                </li>
              );
            })}
          </ul>
        </Hoja>
      )}
    </div>
  );
}

function Tarjeta({ titulo, ir, ancho, tipo, children }: { titulo: string; ir: () => void; ancho: 1 | 2; tipo?: "orbe" | "solido" | "alerta"; children: React.ReactNode }) {
  const base = tipo === "orbe" ? "tarjeta-orbe" : "tarjeta";
  const extra = tipo === "solido" ? "w-solido" : tipo === "alerta" ? "w-alerta" : "";
  return (
    <div role="link" tabIndex={0} className={`${base} ${extra} tarjeta-click flex flex-col gap-2 w-${ancho}`}
      onClick={ir} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ir(); } }}>
      <h2 className="titulo-tarjeta" style={tipo === "orbe" ? { color: "rgba(244,242,238,0.72)" } : undefined}>
        <span>{titulo}</span><Icono nombre="siguiente" tam={16} />
      </h2>
      {children}
    </div>
  );
}

function Barra({ pct, color = "var(--acento-vivo)" }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--linea)" }} role="progressbar" aria-valuenow={Math.min(100, pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

interface WProps { id: IdWidget; ancho: 1 | 2; zona: Zona; yo: Membresia; gestion: boolean; periodo: Periodo; datos: Datos; nombre: (id: string) => string; irA: (d: Destino) => void }

function Widget({ id, ancho, zona, yo, gestion, periodo, datos, nombre, irA }: WProps) {
  const vendido = suma(datos.actual, "vendido");
  const cantidad = suma(datos.actual, "cantidad");
  const paraLocal = suma(datos.actual, "para_local");
  const paraBarbero = suma(datos.actual, "para_barbero");
  const gastosPeriodo = datos.gastos.reduce((s, x) => s + x.total, 0);

  if (id === "ventas") {
    const v = variacion(vendido, suma(datos.anterior, "vendido"));
    const titulo = zona === "inicio" ? "Ventas de hoy" : gestion ? "Ventas brutas" : "Vendiste";
    return (
      <Tarjeta titulo={titulo} ancho={ancho} tipo="orbe" ir={() => irA(zona === "inicio" ? "ventas" : "ventas")}>
        <p className="monto text-[44px] leading-none">{formatearARS(vendido)}</p>
        <p className="texto-suave text-sm">{cantidad} {cantidad === 1 ? "venta" : "ventas"}{cantidad > 0 ? ` · ${formatearARS(Math.round(vendido / cantidad))} cada una` : ""}</p>
        <span className="pill" data-signo={v.direccion}>{textoComparacion(v, periodo)}</span>
      </Tarjeta>
    );
  }

  if (id === "impulso") {
    const mesVendido = suma(datos.mes, "vendido");
    const { dia, total } = diasDelMes();
    const hoyIso = hoyAR();
    const previos = datos.serie.filter((f) => f.dia !== hoyIso);
    const mejorDia = previos.reduce((m, f) => Math.max(m, f.vendido), 0);
    const semPasada = datos.serie.find((f) => f.dia === sumarDias(hoyIso, -7))?.vendido ?? 0;
    const cantMes = suma(datos.mes, "cantidad");
    const imp = calcularImpulso({
      hoy: vendido, meta: datos.meta, mesVendido, dia, totalDias: total, mejorDia, mismoDiaSemanaPasada: semPasada,
      ticket: cantMes > 0 ? Math.round(mesVendido / cantMes) : 0,
    });
    return (
      <Tarjeta titulo="Tu impulso" ancho={ancho} tipo="solido" ir={() => irA("ventas")}>
        <p className="titulo text-[26px] leading-tight">{imp.titulo}</p>
        <p className="texto-suave text-sm">{imp.detalle}</p>
        {imp.objetivoDia > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} role="progressbar" aria-valuenow={imp.pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full" style={{ width: `${imp.pct}%`, background: "linear-gradient(90deg, var(--acento-vivo), #ffc88a)", boxShadow: "0 0 14px var(--acento-vivo)" }} />
            </div>
            <div className="flex justify-between text-xs" style={{ color: "rgba(247,242,236,0.62)" }}>
              <span>{formatearARS(vendido)} hoy</span><span>{formatearARS(imp.objetivoDia)}</span>
            </div>
          </div>
        )}
        {(mejorDia > 0 || semPasada > 0) && (
          <div className="mt-1 flex gap-5 text-xs" style={{ color: "rgba(247,242,236,0.62)" }}>
            {mejorDia > 0 && <span>Mejor día <strong style={{ color: "#f7f2ec" }}>{formatearARS(mejorDia)}</strong></span>}
            {semPasada > 0 && <span>Hace una semana <strong style={{ color: "#f7f2ec" }}>{formatearARS(semPasada)}</strong></span>}
          </div>
        )}
      </Tarjeta>
    );
  }

  if (id === "ganancia") {
    if (!gestion) {
      return (
        <Tarjeta titulo="Tu ganancia" ancho={ancho} ir={() => irA("ventas")}>
          <p className="monto text-3xl">{formatearARS(paraBarbero)}</p>
          <p className="texto-suave text-xs">De {formatearARS(vendido)} vendidos {NOMBRE[periodo]}</p>
        </Tarjeta>
      );
    }
    if (zona === "inicio") {
      return (
        <Tarjeta titulo="Para el local" ancho={ancho} ir={() => irA("ventas")}>
          <p className="monto text-3xl">{formatearARS(paraLocal)}</p>
          <p className="texto-suave text-xs">Su parte de lo vendido hoy, antes de gastos</p>
        </Tarjeta>
      );
    }
    const g = gananciaLocal({ vendido, paraLocal, gastos: gastosPeriodo, alquilerSilla: datos.fijos.alquiler, sueldos: datos.fijos.sueldos, incluirFijos: periodo === "mes" });
    return (
      <Tarjeta titulo="Ganancia neta" ancho={ancho} ir={() => irA("gastos")}>
        <p className="monto text-3xl" style={{ color: g.neta < 0 ? "var(--peligro)" : undefined }}>{formatearARS(g.neta)}</p>
        <p className="texto-suave text-xs">Lo que queda en el local</p>
      </Tarjeta>
    );
  }

  if (id === "desglose") {
    const g = gananciaLocal({ vendido, paraLocal, gastos: gastosPeriodo, alquilerSilla: datos.fijos.alquiler, sueldos: datos.fijos.sueldos, incluirFijos: periodo === "mes" });
    return (
      <Tarjeta titulo="Del bruto al neto" ancho={ancho} ir={() => irA("gastos")}>
        <Linea texto="Ventas brutas" valor={vendido} fuerte />
        <Linea texto="Comisiones de barberos" valor={-paraBarbero} />
        <Linea texto="Parte del local" valor={paraLocal} sub />
        <Linea texto="Gastos del período" valor={-gastosPeriodo} />
        {g.incluyeFijos && <Linea texto="Alquileres de silla" valor={datos.fijos.alquiler} />}
        {g.incluyeFijos && <Linea texto="Sueldos fijos" valor={-datos.fijos.sueldos} />}
        <div className="flex items-end justify-between border-t pt-2">
          <span className="font-semibold">Neta del local</span>
          <span className="monto text-2xl" style={{ color: g.neta < 0 ? "var(--peligro)" : "var(--ok)" }}>{formatearARS(g.neta)}</span>
        </div>
        {!g.incluyeFijos && <p className="texto-suave text-xs">Alquileres de silla y sueldos fijos se suman solo en “Este mes”.</p>}
      </Tarjeta>
    );
  }

  if (id === "metas") {
    const mesVendido = suma(datos.mes, "vendido");
    const { dia, total } = diasDelMes();
    const destino: Destino = yo.role === "OWNER" ? "metas" : "ventas";
    if (!datos.meta) {
      return (
        <Tarjeta titulo="Meta del mes" ancho={ancho} ir={() => irA(destino)}>
          <p className="texto-suave text-sm">{yo.role === "OWNER" ? "Definí la meta de este mes." : "Todavía no hay meta cargada."}</p>
        </Tarjeta>
      );
    }
    const p = progresoMeta(mesVendido, datos.meta, dia, total);
    return (
      <Tarjeta titulo="Meta del mes" ancho={ancho} ir={() => irA(destino)}>
        <div className="grid place-items-center py-1">
          <Anillo pct={p.pct} tam={96}><span className="monto text-2xl">{p.pct}%</span></Anillo>
        </div>
      </Tarjeta>
    );
  }

  if (id === "por_cobrar") {
    const n = datos.porCerrar.length;
    return (
      <Tarjeta titulo="Por cobrar" ancho={ancho} tipo={n > 0 ? "solido" : undefined} ir={() => irA("agenda")}>
        <p className="monto text-5xl leading-none">{n}</p>
        <p className="texto-suave text-sm">{n === 0 ? "Todo cobrado" : n === 1 ? "turno por cobrar" : "turnos por cobrar"}</p>
      </Tarjeta>
    );
  }

  if (id === "turnos_hoy") {
    const ahora = datos.ahora;
    const lista = datos.turnosHoy;
    const proximo = lista.find((t) => t.status === "SCHEDULED" && new Date(t.ends_at).getTime() > ahora)?.id;
    return (
      <Tarjeta titulo="Turnos de hoy" ancho={ancho} ir={() => irA("agenda")}>
        {lista.length === 0 ? <p className="texto-suave text-sm">No hay turnos para hoy.</p> : (
          <ul className="flex flex-col gap-3">
            {lista.slice(0, 5).map((t) => (
              <li key={t.id} className="tiempo" data-estado={t.id === proximo ? "proximo" : t.status === "PAID" || t.status === "DONE" ? "hecho" : "pendiente"}>
                <span className="monto text-[17px]">{horaCorta(t.starts_at)}</span>
                <span className="tiempo-punto" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{nombreCliente(t)}</span>
                  <span className="texto-suave block truncate text-xs">{t.service_name ?? "Sin servicio"}{gestion ? ` · ${nombre(t.barber_membership_id)}` : ""} · {ETIQUETA_ESTADO[t.status].split(" · ")[0]}</span>
                </span>
              </li>
            ))}
            {lista.length > 5 && <li className="texto-suave text-xs">y {lista.length - 5} más…</li>}
          </ul>
        )}
      </Tarjeta>
    );
  }

  if (id === "ticket") {
    return (
      <Tarjeta titulo="Ticket promedio" ancho={ancho} ir={() => irA("ventas")}>
        <p className="monto text-3xl">{cantidad ? formatearARS(Math.round(vendido / cantidad)) : "—"}</p>
        <p className="texto-suave text-xs">{cantidad} {cantidad === 1 ? "venta" : "ventas"} {NOMBRE[periodo]}</p>
      </Tarjeta>
    );
  }

  if (id === "por_servicio") {
    const max = Math.max(1, ...datos.servicios.map((s) => s.vendido));
    return (
      <Tarjeta titulo="Ventas por servicio" ancho={ancho} ir={() => irA("reportes")}>
        {datos.servicios.length === 0 ? <p className="texto-suave text-sm">Sin ventas {NOMBRE[periodo]}.</p> : (
          <ul className="flex flex-col gap-3 text-sm">
            {datos.servicios.slice(0, 6).map((s) => (
              <li key={s.service_name} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2"><span className="truncate">{s.service_name} <span className="texto-suave">· {s.cantidad}</span></span><span className="monto">{formatearARS(s.vendido)}</span></span>
                <Barra pct={(s.vendido / max) * 100} />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    );
  }

  if (id === "medios_pago") {
    const filas = MEDIOS_PAGO.map((m) => ({ ...m, total: datos.actual.filter((f) => f.payment_method === m.valor).reduce((s, f) => s + f.vendido, 0) }))
      .filter((m) => m.total > 0).sort((a, b) => b.total - a.total);
    return (
      <Tarjeta titulo="Medios de pago" ancho={ancho} ir={() => irA("reportes")}>
        {filas.length === 0 ? <p className="texto-suave text-sm">Sin ventas {NOMBRE[periodo]}.</p> : (
          <>
            <div className="barra-apilada" aria-hidden="true">
              {filas.map((m, i) => <span key={m.valor} style={{ width: `${(m.total / vendido) * 100}%`, background: COLORES[i % COLORES.length] }} />)}
            </div>
            <ul className="flex flex-col gap-1 text-sm">
              {filas.slice(0, 4).map((m, i) => (
                <li key={m.valor} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2"><span style={{ width: 8, height: 8, borderRadius: 99, background: COLORES[i % COLORES.length], flex: "none" }} /><span className="truncate">{m.etiqueta}</span></span>
                  <span className="texto-suave">{vendido ? Math.round((m.total / vendido) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Tarjeta>
    );
  }

  if (id === "comision") {
    const aPagar = datos.pendiente.reduce((t, f) => t + f.a_pagar, 0);
    return (
      <Tarjeta titulo={gestion ? "Comisiones por pagar" : "Tu comisión por cobrar"} ancho={ancho} ir={() => irA(gestion ? "caja" : "ventas")}>
        <p className="monto text-3xl">{formatearARS(aPagar)}</p>
        <p className="texto-suave text-xs">{aPagar === 0 ? "Nada pendiente de liquidar" : `${datos.pendiente.reduce((t, f) => t + f.cantidad, 0)} ventas sin liquidar`}</p>
      </Tarjeta>
    );
  }

  if (id === "gastos_cat") {
    const max = Math.max(1, ...datos.gastos.map((g) => g.total));
    return (
      <Tarjeta titulo="Gastos por categoría" ancho={ancho} ir={() => irA("gastos")}>
        {datos.gastos.length === 0 ? <p className="texto-suave text-sm">Sin gastos {NOMBRE[periodo]}.</p> : (
          <ul className="flex flex-col gap-3 text-sm">
            {datos.gastos.map((g) => (
              <li key={g.category} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2"><span>{CATEGORIAS_GASTO.find((c) => c.valor === g.category)?.etiqueta ?? g.category}</span><span className="monto">{formatearARS(g.total)}</span></span>
                <Barra pct={(g.total / max) * 100} color="var(--par)" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    );
  }

  if (id === "alertas") {
    const lista: { texto: string; grave: boolean; ir: Destino }[] = [];
    const etiquetaCat = (c: string) => CATEGORIAS_GASTO.find((x) => x.valor === c)?.etiqueta ?? c;
    for (const a of alertasDePresupuesto(datos.gastosMes, datos.presupuestos)) {
      lista.push({ ir: "gastos", grave: a.nivel === "excedido", texto: `${a.nivel === "excedido" ? "Te pasaste del presupuesto" : "Cerca del límite"} en ${etiquetaCat(a.categoria)}: ${formatearARS(a.gastado)} de ${formatearARS(a.presupuesto)}.` });
    }
    if (datos.cajaAyerSinCerrar) lista.push({ ir: "caja", grave: false, texto: "La caja de ayer no se cerró." });
    if (datos.meta) {
      const { dia, total } = diasDelMes();
      const p = progresoMeta(suma(datos.mes, "vendido"), datos.meta, dia, total);
      if (!p.alcanzada && dia >= 7 && p.proyeccion < datos.meta) lista.push({ ir: "metas", grave: false, texto: `A este ritmo cerrarías el mes en ${formatearARS(p.proyeccion)}, por debajo de la meta.` });
    }
    // En el inicio solo molesta si hay algo que atender.
    if (lista.length === 0 && zona === "inicio") return null;
    return (
      <Tarjeta titulo="Alertas" ancho={ancho} tipo={lista.length ? "alerta" : undefined} ir={() => irA(lista[0]?.ir ?? "caja")}>
        {lista.length === 0 ? <p className="texto-suave text-sm">Todo en orden.</p> : (
          <ul className="flex flex-col gap-2 text-sm">
            {lista.map((a) => <li key={a.texto}><button className={`text-left ${a.grave ? "text-red-600" : ""}`} onClick={(ev) => { ev.stopPropagation(); irA(a.ir); }}>{a.texto}</button></li>)}
          </ul>
        )}
      </Tarjeta>
    );
  }

  // por_barbero
  const filas = Array.from(new Set(datos.actual.map((f) => f.barber_membership_id)))
    .map((mid) => {
      const f = datos.actual.filter((x) => x.barber_membership_id === mid);
      return { mid, total: suma(f, "vendido"), cant: suma(f, "cantidad"), gana: suma(f, "para_barbero") };
    })
    .sort((a, b) => b.total - a.total);
  return (
    <Tarjeta titulo="Por barbero" ancho={ancho} ir={() => irA("ventas")}>
      {filas.length === 0 ? <p className="texto-suave text-sm">Sin ventas {NOMBRE[periodo]}.</p> : (
        <ol className="flex flex-col gap-3">
          {filas.map((f, i) => (
            <li key={f.mid} className="flex items-center gap-3">
              <span className="avatar" style={{ width: 36, height: 36, fontSize: 14, opacity: i === 0 ? 1 : 0.7 }}>{nombre(f.mid).slice(0, 1).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{nombre(f.mid)}</span>
                <span className="texto-suave block text-xs">{f.cant} {f.cant === 1 ? "venta" : "ventas"} · gana {formatearARS(f.gana)}</span>
              </span>
              <span className="monto text-lg">{formatearARS(f.total)}</span>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
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

async function cargarDatos(yo: Membresia, periodo: Periodo, gestion: boolean, hayAgenda: boolean, conSerie: boolean): Promise<{ datos: Datos; error: boolean }> {
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

  const ayer = rangoDia(sumarDias(hoyAR(), -1));
  const hace90 = rangoDia(sumarDias(hoyAR(), -90));
  const [a, b, m, g, s, f, meta, hoy, cerrar, pend, gMes, pres, cierreAyer, ventasAyer, serieRes] = await Promise.all([
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
    sb.rpc("pendiente_liquidacion", { p_business: neg, p_upto: hoyAR() }),
    gestion ? sb.rpc("resumen_gastos", { p_business: neg, p_desde: rMes.desde, p_hasta: rMes.hasta }) : vacio,
    gestion ? sb.from("budgets").select("category,month,amount").eq("business_id", neg).eq("month", mesActual()) : vacio,
    gestion ? sb.from("cash_closings").select("id").eq("business_id", neg).eq("closing_date", sumarDias(hoyAR(), -1)) : vacio,
    gestion && ayer ? sb.rpc("resumen_ventas", { p_business: neg, p_desde: ayer.desde, p_hasta: ayer.hasta }) : vacio,
    conSerie && hace90
      ? sb.rpc("serie_diaria", { p_business: neg, p_desde: hace90.desde, p_hasta: new Date(Date.now() + 60_000).toISOString() })
      : vacio,
  ]);

  const metas = sacar<{ barber_membership_id: string | null; amount: number }>(meta);
  const suya = gestion ? metas.find((x) => x.barber_membership_id === null) : metas.find((x) => x.barber_membership_id === yo.id);
  const fijos = sacar<{ alquiler_silla: number; sueldos: number }>(f)[0];
  const turnosHoy = sacar<Turno>(hoy).filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
  const porCerrar = sacar<Turno>(cerrar).filter((t) => esPorCerrar(t));

  return {
    error: hayError,
    datos: {
      actual: sacar<FilaResumenVentas>(a), anterior: sacar<FilaResumenVentas>(b), mes: sacar<FilaResumenVentas>(m),
      gastos: sacar<FilaResumenGastos>(g), servicios: sacar<FilaResumenServicio>(s),
      fijos: { alquiler: Number(fijos?.alquiler_silla ?? 0), sueldos: Number(fijos?.sueldos ?? 0) },
      meta: suya?.amount ?? null, turnosHoy, porCerrar,
      pendiente: sacar<FilaPendiente>(pend), gastosMes: sacar<FilaResumenGastos>(gMes), presupuestos: sacar<Presupuesto>(pres),
      ahora: Date.now(), serie: sacar<FilaDia>(serieRes).map((f) => ({ ...f, dia: String(f.dia), vendido: Number(f.vendido), cantidad: Number(f.cantidad) })),
      cajaAyerSinCerrar: gestion && sacar<{ id: string }>(cierreAyer).length === 0 && sacar<FilaResumenVentas>(ventasAyer).length > 0,
    },
  };
}
