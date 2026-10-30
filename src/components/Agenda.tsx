"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { hoyAR } from "@/lib/periodos";
import { MEDIOS_PAGO, type Cliente, type Membresia, type Servicio, type Turno, type Venta } from "@/lib/tipos";
import { formatearARS } from "@/lib/dinero";
import {
  ETIQUETA_ESTADO, esPorCerrar, fechaHoraAIso, fechaLarga, horaCorta, horasDelDia, nombreCliente, sumarDias,
} from "@/lib/turnos";
import { celdasDelMes, fechaAR, mesDe, nombreMes, numeroDelDia, rangoMes, sumarMeses } from "@/lib/calendario";
import { Campo, Cargando, EncabezadoHoja, Fichas, Hoja, Icono, PieHoja, Segmentado } from "@/components/ui";
import type { TurnoACobrar } from "@/components/VentaModal";

interface Props { yo: Membresia; equipo: Membresia[]; hayClientes: boolean; onCobrar: (t: TurnoACobrar) => void; refresco: number }
interface Datos { mes: Turno[]; ventas: Venta[]; porCerrar: Turno[]; servicios: Servicio[]; clientes: Cliente[] }
type Item = { k: "turno"; t: Turno; at: number } | { k: "venta"; v: Venta; at: number };
type Modal = { modo: "nuevo" } | { modo: "editar"; t: Turno } | { modo: "cerrar" } | null;
const DURACIONES = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180];
type Vista = "dia" | "calendario";

const TURNO = "*, clients(name,phone)";

async function cargar(yo: Membresia, mes: string, hayClientes: boolean): Promise<Datos & { error: boolean }> {
  const sb = getSupabase();
  const rango = rangoMes(mes);
  const ahora = new Date().toISOString();
  const [d, c, s, cl, vt] = await Promise.all([
    rango
      ? sb.from("appointments").select(TURNO).eq("business_id", yo.business_id).gte("starts_at", rango.desde).lt("starts_at", rango.hasta).order("starts_at").limit(1000)
      : Promise.resolve({ data: [], error: null }),
    sb.from("appointments").select(TURNO).eq("business_id", yo.business_id)
      .or(`status.eq.DONE,and(status.eq.SCHEDULED,ends_at.lte.${ahora})`).order("starts_at").limit(50),
    sb.from("services").select("id,business_id,name,default_price,duration_minutes,active").eq("business_id", yo.business_id).eq("active", true).order("name"),
    hayClientes
      ? sb.from("clients").select("id,business_id,name,phone,notes,active").eq("business_id", yo.business_id).eq("active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
    rango
      ? sb.from("sales").select("id,barber_membership_id,service_name,amount,payment_method,sold_at,commission_model,commission_bps,barber_amount,local_amount,status,cancel_reason")
          .eq("business_id", yo.business_id).eq("status", "VALID").gte("sold_at", rango.desde).lt("sold_at", rango.hasta).order("sold_at").limit(1000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    error: Boolean(d.error || c.error || s.error || cl.error || vt.error),
    mes: (d.data as Turno[]) ?? [],
    ventas: (vt.data as Venta[]) ?? [],
    porCerrar: ((c.data as Turno[]) ?? []).filter((t) => esPorCerrar(t)),
    servicios: (s.data as Servicio[]) ?? [],
    clientes: (cl.data as Cliente[]) ?? [],
  };
}

export default function Agenda({ yo, equipo, hayClientes, onCobrar, refresco }: Props) {
  const [vista, setVista] = useState<Vista>("dia");
  const [fecha, setFecha] = useState(hoyAR());
  const [mesVista, setMesVista] = useState(mesDe(hoyAR()));
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const mes = vista === "calendario" ? mesVista : mesDe(fecha);

  useEffect(() => {
    let vivo = true;
    void cargar(yo, mes, hayClientes).then((r) => {
      if (!vivo) return;
      setError(r.error ? "No se pudo cargar la agenda." : null);
      setDatos(r);
    });
    return () => { vivo = false; };
  }, [yo, mes, hayClientes, version, refresco]);

  const gestion = yo.role !== "BARBER";
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  // Los turnos cobrados ya tienen su venta: esa venta no se repite como renglón aparte.
  const { turnosPorDia, ventasPorDia } = useMemo(() => {
    const t = new Map<string, Turno[]>();
    const v = new Map<string, Venta[]>();
    const conTurno = new Set((datos?.mes ?? []).map((x) => x.sale_id).filter(Boolean));
    for (const x of datos?.mes ?? []) { const k = fechaAR(x.starts_at); t.set(k, [...(t.get(k) ?? []), x]); }
    for (const x of datos?.ventas ?? []) {
      if (conTurno.has(x.id)) continue;
      const k = fechaAR(x.sold_at);
      v.set(k, [...(v.get(k) ?? []), x]);
    }
    return { turnosPorDia: t, ventasPorDia: v };
  }, [datos]);

  if (!datos) return <Cargando />;

  const delDia = turnosPorDia.get(fecha) ?? [];
  const activos = delDia.filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
  const otros = delDia.filter((t) => t.status === "CANCELED" || t.status === "NO_SHOW");
  const items: Item[] = [
    ...activos.map((t): Item => ({ k: "turno", t, at: new Date(t.starts_at).getTime() })),
    ...(ventasPorDia.get(fecha) ?? []).map((v): Item => ({ k: "venta", v, at: new Date(v.sold_at).getTime() })),
  ].sort((a, b) => a.at - b.at);

  function cobrar(t: Turno) {
    const s = datos?.servicios.find((x) => x.id === t.service_id);
    onCobrar({ id: t.id, cliente: nombreCliente(t), servicio: t.service_name ?? null, precio: s?.default_price ?? null, barbero: nombre(t.barber_membership_id) });
  }
  const tarjeta = (t: Turno, conFecha = false) => (
    <TarjetaTurno key={t.id} t={t} gestion={gestion} nombre={nombre} onCobrar={() => cobrar(t)} onEditar={() => setModal({ modo: "editar", t })}
      onCambio={recargar} onError={setError} conFecha={conFecha} />
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Segmentado etiqueta="Vista de la agenda" valor={vista} onCambio={(v) => { setVista(v); if (v === "calendario") setMesVista(mesDe(fecha)); }}
          opciones={[{ valor: "dia", texto: "Día" }, { valor: "calendario", texto: "Calendario" }]} />
        <button className="boton-chico inline-flex items-center gap-1" style={{ minHeight: 46, borderRadius: 18 }} onClick={() => setModal({ modo: "nuevo" })}>
          <Icono nombre="mas" tam={18} /> Turno
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {datos.porCerrar.length > 0 && (
        <button className="tarjeta tarjeta-click flex items-center justify-between gap-3 w-solido" onClick={() => setModal({ modo: "cerrar" })}>
          <span>
            <span className="block font-bold">Por cerrar · {datos.porCerrar.length}</span>
            <span className="block text-sm" style={{ opacity: 0.75 }}>Turnos terminados o vencidos: cobralos o cancelalos</span>
          </span>
          <Icono nombre="siguiente" tam={20} />
        </button>
      )}

      {vista === "calendario" ? (
        <Calendario mes={mesVista} fecha={fecha} turnosPorDia={turnosPorDia} ventasPorDia={ventasPorDia}
          onMes={(n) => setMesVista(sumarMeses(mesVista, n))} onDia={(d) => setFecha(d)} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <button className="chip" style={{ width: 46, padding: 0 }} aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}><Icono nombre="volver" tam={18} /></button>
          <div className="text-center">
            <p className="titulo text-lg font-semibold capitalize">{fechaLarga(fecha)}</p>
            {fecha !== hoyAR() && <button className="text-xs font-semibold underline" onClick={() => setFecha(hoyAR())}>Volver a hoy</button>}
          </div>
          <button className="chip" style={{ width: 46, padding: 0 }} aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}><Icono nombre="siguiente" tam={18} /></button>
        </div>
      )}

      {vista === "calendario" && (
        <div className="flex items-center justify-between">
          <p className="titulo text-lg font-semibold capitalize">{fechaLarga(fecha)}</p>
          <button className="text-sm font-semibold underline" onClick={() => setVista("dia")}>Ver día completo</button>
        </div>
      )}

      {items.length === 0 && <p className="texto-suave text-sm">No hay turnos ni ventas este día.</p>}
      {items.map((it) => it.k === "turno" ? tarjeta(it.t) : <FilaVenta key={it.v.id} v={it.v} gestion={gestion} nombre={nombre} />)}

      {otros.length > 0 && (
        <details>
          <summary className="texto-suave cursor-pointer text-sm">Cancelados y no vinieron ({otros.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {otros.map((t) => <li key={t.id}>{horaCorta(t.starts_at)} · {nombreCliente(t)} · {ETIQUETA_ESTADO[t.status]}{t.cancel_reason ? ` (${t.cancel_reason})` : ""}</li>)}
          </ul>
        </details>
      )}

      {(modal?.modo === "nuevo" || modal?.modo === "editar") && (
        <Hoja titulo={modal.modo === "nuevo" ? "Nuevo turno" : "Editar turno"} onCerrar={() => setModal(null)}>
          <FormTurno yo={yo} equipo={equipo} fecha={fecha} servicios={datos.servicios} clientes={datos.clientes} hayClientes={hayClientes}
            turno={modal.modo === "editar" ? modal.t : null} onCerrar={() => setModal(null)} onListo={() => { setModal(null); recargar(); }} />
        </Hoja>
      )}

      {modal?.modo === "cerrar" && (
        <Hoja titulo="Por cerrar" onCerrar={() => setModal(null)} ancho>
          <EncabezadoHoja titulo="Por cerrar" detalle="Turnos terminados o con la hora vencida: cobralos o cancelalos." onCerrar={() => setModal(null)} />
          <div className="flex flex-col gap-3">{datos.porCerrar.map((t) => tarjeta(t, true))}</div>
        </Hoja>
      )}
    </section>
  );
}

function FilaVenta({ v, gestion, nombre }: { v: Venta; gestion: boolean; nombre: (id: string) => string }) {
  const medio = MEDIOS_PAGO.find((m) => m.valor === v.payment_method)?.etiqueta ?? v.payment_method;
  return (
    <div className="tarjeta flex items-center justify-between gap-3" style={{ padding: "14px 18px", borderStyle: "dashed" }}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="icono-caja"><Icono nombre="check" tam={18} /></span>
        <div className="min-w-0">
          <p className="truncate font-semibold"><span className="monto">{horaCorta(v.sold_at)}</span> · Venta {v.service_name ? `· ${v.service_name}` : ""}</p>
          <p className="texto-suave truncate text-xs">{medio}{gestion ? ` · ${nombre(v.barber_membership_id)}` : ""}</p>
        </div>
      </div>
      <span className="monto text-lg">{formatearARS(v.amount)}</span>
    </div>
  );
}

function Calendario({ mes, fecha, turnosPorDia, ventasPorDia, onMes, onDia }: {
  mes: string; fecha: string; turnosPorDia: Map<string, Turno[]>; ventasPorDia: Map<string, Venta[]>; onMes: (n: number) => void; onDia: (d: string) => void;
}) {
  const hoy = hoyAR();
  return (
    <div className="tarjeta flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button className="chip" style={{ width: 44, padding: 0 }} aria-label="Mes anterior" onClick={() => onMes(-1)}><Icono nombre="volver" tam={18} /></button>
        <p className="titulo text-lg font-semibold capitalize">{nombreMes(mes)}</p>
        <button className="chip" style={{ width: 44, padding: 0 }} aria-label="Mes siguiente" onClick={() => onMes(1)}><Icono nombre="siguiente" tam={18} /></button>
      </div>
      <div className="rejilla-semana" aria-hidden="true">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i} className="cabeza-dia">{d}</span>)}
      </div>
      <div className="rejilla-mes">
        {celdasDelMes(mes).map((d, i) => {
          if (!d) return <span key={`v${i}`} className="celda-dia" data-vacia="true" />;
          const turnos = (turnosPorDia.get(d) ?? []).filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
          const ventas = ventasPorDia.get(d) ?? [];
          const pendientes = turnos.filter((t) => esPorCerrar(t)).length;
          const total = turnos.length + ventas.length;
          return (
            <button key={d} className="celda-dia" data-hoy={d === hoy} aria-pressed={d === fecha}
              aria-label={`${numeroDelDia(d)}: ${total === 0 ? "sin movimientos" : `${turnos.length} turnos y ${ventas.length} ventas`}`}
              onClick={() => onDia(d)}>
              <span>{numeroDelDia(d)}</span>
              <span className="puntos">
                {turnos.slice(0, 3).map((t, j) => <span key={j} className="punto" data-tipo={esPorCerrar(t) && pendientes > 0 ? "pendiente" : "normal"} />)}
                {turnos.length < 3 && ventas.length > 0 && <span className="punto" data-tipo="venta" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="texto-suave text-xs">Tocá un día para ver su detalle. Punto rojo: por cobrar o cerrar · punto tenue: ventas sueltas.</p>
    </div>
  );
}

function TarjetaTurno({ t, gestion, nombre, onCobrar, onEditar, onCambio, onError, conFecha }: {
  t: Turno; gestion: boolean; nombre: (id: string) => string; onCobrar: () => void; onEditar: () => void; onCambio: () => void; onError: (m: string | null) => void; conFecha?: boolean;
}) {
  const [enviando, setEnviando] = useState(false);
  const abierto = t.status === "SCHEDULED" || t.status === "DONE";

  async function llamar(fn: string, args: Record<string, unknown>) {
    setEnviando(true);
    onError(null);
    const { error } = await getSupabase().rpc(fn, args);
    setEnviando(false);
    if (error) onError(error.message); else onCambio();
  }

  async function cancelar() {
    const motivo = window.prompt("Motivo de la cancelación:");
    if (motivo) await llamar("cancel_appointment", { p_appointment: t.id, p_reason: motivo, p_no_show: false });
  }

  const fechaTxt = conFecha ? `${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" }).format(new Date(t.starts_at))} · ` : "";

  return (
    <div className="tarjeta flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="monto text-xl">{fechaTxt}{horaCorta(t.starts_at)}<span className="texto-suave text-base font-normal"> – {horaCorta(t.ends_at)}</span></p>
          <p className="truncate font-semibold">{nombreCliente(t)}</p>
          <p className="texto-suave text-sm">{t.service_name ?? "Sin servicio"}{gestion ? ` · ${nombre(t.barber_membership_id)}` : ""}</p>
          {t.note && <p className="texto-suave text-sm">{t.note}</p>}
        </div>
        <span className="chip-pequeno whitespace-nowrap">{ETIQUETA_ESTADO[t.status]}</span>
      </div>

      {abierto && (
        <div className="flex flex-wrap gap-2">
          <button className="boton-chico" disabled={enviando} onClick={onCobrar}>Cobrar</button>
          {t.status === "SCHEDULED" && <button className="chip" disabled={enviando} onClick={onEditar}>Editar</button>}
          {t.status === "SCHEDULED" && <button className="chip" disabled={enviando} onClick={() => llamar("finish_appointment", { p_appointment: t.id })}>Terminar</button>}
          <button className="chip" disabled={enviando} onClick={() => llamar("cancel_appointment", { p_appointment: t.id, p_reason: null, p_no_show: true })}>No vino</button>
          <button className="chip" disabled={enviando} onClick={cancelar}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

// Formulario de turno (crear o editar), pensado para un modal: cada dato en su propio bloque, apilados.
function FormTurno({ yo, equipo, fecha, servicios, clientes, hayClientes, turno, onCerrar, onListo }: {
  yo: Membresia; equipo: Membresia[]; fecha: string; servicios: Servicio[]; clientes: Cliente[]; hayClientes: boolean; turno: Turno | null; onCerrar: () => void; onListo: () => void;
}) {
  const editando = turno !== null;
  const gestion = yo.role !== "BARBER";
  const minutosActuales = turno ? Math.round((new Date(turno.ends_at).getTime() - new Date(turno.starts_at).getTime()) / 60000) : 30;
  const [barbero, setBarbero] = useState(turno?.barber_membership_id ?? yo.id);
  const [dia, setDia] = useState(turno ? fechaAR(turno.starts_at) : fecha);
  const [hora, setHora] = useState(turno ? horaCorta(turno.starts_at) : "10:00");
  const [duracion, setDuracion] = useState(minutosActuales);
  const [servicio, setServicio] = useState<string | null>(turno?.service_id ?? null);
  const [cliente, setCliente] = useState(turno?.client_id ?? "");
  const [nombreLibre, setNombreLibre] = useState(turno?.client_name ?? "");
  const [nota, setNota] = useState(turno?.note ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<string>(crypto.randomUUID());

  const horas = horasDelDia().includes(hora) ? horasDelDia() : [...horasDelDia(), hora].sort();
  const duraciones = DURACIONES.includes(duracion) ? DURACIONES : [...DURACIONES, duracion].sort((a, b) => a - b);

  function elegirServicio(id: string) {
    const nuevo = servicio === id ? null : id;
    setServicio(nuevo);
    const s = servicios.find((x) => x.id === nuevo);
    if (s) setDuracion(s.duration_minutes);
  }

  // Para "llegó tarde" / "reagendó unos minutos": corre la hora de a 15 minutos.
  function correr(min: number) {
    const i = fechaHoraAIso(dia, hora);
    if (!i) return;
    const d = new Date(new Date(i).getTime() + min * 60000);
    const local = new Date(d.getTime() - 3 * 3_600_000);
    setDia(local.toISOString().slice(0, 10));
    setHora(`${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`);
  }

  async function guardar() {
    const inicio = fechaHoraAIso(dia, hora);
    if (!inicio) { setError("Elegí una fecha y una hora válidas."); return; }
    setEnviando(true);
    setError(null);
    const sb = getSupabase();
    const comunes = { p_service: servicio, p_client: cliente || null, p_client_name: cliente ? null : nombreLibre || null, p_note: nota || null };
    const { error: e } = editando
      ? await sb.rpc("update_appointment", { p_appointment: turno.id, p_starts_at: inicio, p_duration_minutes: duracion, p_barber_membership: barbero, ...comunes })
      : await sb.rpc("create_appointment", { p_business: yo.business_id, p_barber_membership: barbero, p_starts_at: inicio, p_idempotency_key: clave.current, p_duration_minutes: duracion, ...comunes });
    setEnviando(false);
    if (e) setError(e.message); else onListo();
  }

  return (
    <div className="formulario">
      <EncabezadoHoja titulo={editando ? "Editar turno" : "Nuevo turno"} detalle={editando ? "Cambiá lo que haga falta sin cancelarlo." : undefined} onCerrar={onCerrar} />

      {gestion && (
        <div className="campo-grupo">
          <span className="campo-etiqueta">Barbero</span>
          <Fichas etiqueta="Barbero" valor={barbero} onCambio={setBarbero} opciones={equipo.map((m) => ({ valor: m.id, texto: m.display_name }))} />
        </div>
      )}

      <div className="fila-2">
        <Campo etiqueta="Día"><input className="campo" type="date" value={dia} onChange={(e) => setDia(e.target.value)} /></Campo>
        <Campo etiqueta="Hora">
          <select className="campo" value={hora} onChange={(e) => setHora(e.target.value)}>
            {horas.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </Campo>
      </div>
      <div className="flex gap-2">
        <button type="button" className="chip" onClick={() => correr(-15)}>−15 min</button>
        <button type="button" className="chip" onClick={() => correr(15)}>+15 min</button>
        <button type="button" className="chip" onClick={() => correr(30)}>+30 min</button>
      </div>

      <div className="campo-grupo">
        <span className="campo-etiqueta">Servicio</span>
        {servicios.length === 0 ? <p className="texto-suave text-sm">Sin servicios cargados: elegí la duración abajo.</p> : (
          <Fichas etiqueta="Servicio" valor={servicio} onCambio={elegirServicio}
            opciones={servicios.map((s) => ({ valor: s.id, texto: s.name, detalle: `${s.duration_minutes} min · ${formatearARS(s.default_price)}` }))} />
        )}
      </div>

      <Campo etiqueta="Duración">
        <select className="campo" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
          {duraciones.map((d) => <option key={d} value={d}>{d} minutos</option>)}
        </select>
      </Campo>

      {hayClientes && (
        <Campo etiqueta="Cliente">
          <select className="campo" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Sin ficha (escribir nombre)</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Campo>
      )}
      {!cliente && (
        <Campo etiqueta="Nombre del cliente"><input className="campo" value={nombreLibre} maxLength={80} onChange={(e) => setNombreLibre(e.target.value)} /></Campo>
      )}
      <Campo etiqueta="Nota (opcional)"><input className="campo" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} /></Campo>

      <PieHoja>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="boton" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : editando ? "Guardar cambios" : "Agendar turno"}</button>
      </PieHoja>
    </div>
  );
}
