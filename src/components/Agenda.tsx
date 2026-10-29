"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { hoyAR } from "@/lib/periodos";
import { type Cliente, type Membresia, type Servicio, type Turno } from "@/lib/tipos";
import {
  ETIQUETA_ESTADO, esPorCerrar, fechaHoraAIso, fechaLarga, horaCorta, horasDelDia, nombreCliente, sumarDias,
} from "@/lib/turnos";
import { celdasDelMes, fechaAR, mesDe, nombreMes, numeroDelDia, rangoMes, sumarMeses } from "@/lib/calendario";
import { Cargando, Icono, Segmentado } from "@/components/ui";
import type { TurnoACobrar } from "@/components/VentaModal";

interface Props { yo: Membresia; equipo: Membresia[]; hayClientes: boolean; onCobrar: (t: TurnoACobrar) => void; refresco: number }
interface Datos { mes: Turno[]; porCerrar: Turno[]; servicios: Servicio[]; clientes: Cliente[] }
type Vista = "dia" | "calendario";

const TURNO = "*, clients(name,phone)";

async function cargar(yo: Membresia, mes: string, hayClientes: boolean): Promise<Datos & { error: boolean }> {
  const sb = getSupabase();
  const rango = rangoMes(mes);
  const ahora = new Date().toISOString();
  const [d, c, s, cl] = await Promise.all([
    rango
      ? sb.from("appointments").select(TURNO).eq("business_id", yo.business_id).gte("starts_at", rango.desde).lt("starts_at", rango.hasta).order("starts_at").limit(1000)
      : Promise.resolve({ data: [], error: null }),
    sb.from("appointments").select(TURNO).eq("business_id", yo.business_id)
      .or(`status.eq.DONE,and(status.eq.SCHEDULED,ends_at.lte.${ahora})`).order("starts_at").limit(50),
    sb.from("services").select("id,business_id,name,default_price,duration_minutes,active").eq("business_id", yo.business_id).eq("active", true).order("name"),
    hayClientes
      ? sb.from("clients").select("id,business_id,name,phone,notes,active").eq("business_id", yo.business_id).eq("active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  return {
    error: Boolean(d.error || c.error || s.error || cl.error),
    mes: (d.data as Turno[]) ?? [],
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
  const [nuevo, setNuevo] = useState(false);
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
  const porDia = useMemo(() => {
    const mapa = new Map<string, Turno[]>();
    for (const t of datos?.mes ?? []) {
      const k = fechaAR(t.starts_at);
      mapa.set(k, [...(mapa.get(k) ?? []), t]);
    }
    return mapa;
  }, [datos]);

  if (!datos) return <Cargando />;

  const delDia = porDia.get(fecha) ?? [];
  const activos = delDia.filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
  const otros = delDia.filter((t) => t.status === "CANCELED" || t.status === "NO_SHOW");

  function cobrar(t: Turno) {
    const s = datos?.servicios.find((x) => x.id === t.service_id);
    onCobrar({ id: t.id, cliente: nombreCliente(t), servicio: t.service_name ?? null, precio: s?.default_price ?? null, barbero: nombre(t.barber_membership_id) });
  }
  const tarjeta = (t: Turno, conFecha = false) => (
    <TarjetaTurno key={t.id} t={t} gestion={gestion} nombre={nombre} onCobrar={() => cobrar(t)} onCambio={recargar} onError={setError} conFecha={conFecha} />
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Segmentado etiqueta="Vista de la agenda" valor={vista} onCambio={(v) => { setVista(v); if (v === "calendario") setMesVista(mesDe(fecha)); }}
          opciones={[{ valor: "dia", texto: "Día" }, { valor: "calendario", texto: "Calendario" }]} />
        <button className="boton-chico inline-flex items-center gap-1" style={{ minHeight: 46, borderRadius: 18 }} onClick={() => setNuevo((v) => !v)}>
          <Icono nombre={nuevo ? "cerrar" : "mas"} tam={18} /> {nuevo ? "Cerrar" : "Turno"}
        </button>
      </div>

      {nuevo && (
        <NuevoTurno yo={yo} equipo={equipo} fecha={fecha} servicios={datos.servicios} clientes={datos.clientes} hayClientes={hayClientes}
          onListo={() => { setNuevo(false); recargar(); }} />
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {datos.porCerrar.length > 0 && (
        <details className="tarjeta" open>
          <summary className="cursor-pointer font-semibold">Por cerrar ({datos.porCerrar.length})</summary>
          <p className="texto-suave mb-3 mt-1 text-sm">Turnos terminados o con la hora vencida: cobralos o cancelalos.</p>
          <div className="flex flex-col gap-3">{datos.porCerrar.map((t) => tarjeta(t, true))}</div>
        </details>
      )}

      {vista === "calendario" ? (
        <Calendario mes={mesVista} fecha={fecha} porDia={porDia}
          onMes={(n) => setMesVista(sumarMeses(mesVista, n))}
          onDia={(d) => setFecha(d)} />
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

      {activos.length === 0 && <p className="texto-suave text-sm">No hay turnos este día.</p>}
      {activos.map((t) => tarjeta(t))}
      {otros.length > 0 && (
        <details>
          <summary className="texto-suave cursor-pointer text-sm">Cancelados y no vinieron ({otros.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {otros.map((t) => <li key={t.id}>{horaCorta(t.starts_at)} · {nombreCliente(t)} · {ETIQUETA_ESTADO[t.status]}{t.cancel_reason ? ` (${t.cancel_reason})` : ""}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function Calendario({ mes, fecha, porDia, onMes, onDia }: {
  mes: string; fecha: string; porDia: Map<string, Turno[]>; onMes: (n: number) => void; onDia: (d: string) => void;
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
          const turnos = (porDia.get(d) ?? []).filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
          const pendientes = turnos.filter((t) => esPorCerrar(t)).length;
          return (
            <button key={d} className="celda-dia" data-hoy={d === hoy} aria-pressed={d === fecha}
              aria-label={`${numeroDelDia(d)}: ${turnos.length === 0 ? "sin turnos" : `${turnos.length} ${turnos.length === 1 ? "turno" : "turnos"}`}`}
              onClick={() => onDia(d)}>
              <span>{numeroDelDia(d)}</span>
              <span className="puntos">
                {turnos.slice(0, 3).map((t, j) => <span key={j} className="punto" data-tipo={esPorCerrar(t) && pendientes > 0 ? "pendiente" : "normal"} />)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="texto-suave text-xs">Tocá un día para ver sus turnos. Los puntos rojos son turnos por cobrar o cerrar.</p>
    </div>
  );
}

function TarjetaTurno({ t, gestion, nombre, onCobrar, onCambio, onError, conFecha }: {
  t: Turno; gestion: boolean; nombre: (id: string) => string; onCobrar: () => void; onCambio: () => void; onError: (m: string | null) => void; conFecha?: boolean;
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
        <div>
          <p className="monto text-xl">{fechaTxt}{horaCorta(t.starts_at)}<span className="texto-suave text-base font-normal"> – {horaCorta(t.ends_at)}</span></p>
          <p className="font-semibold">{nombreCliente(t)}</p>
          <p className="texto-suave text-sm">{t.service_name ?? "Sin servicio"}{gestion ? ` · ${nombre(t.barber_membership_id)}` : ""}</p>
          {t.note && <p className="texto-suave text-sm">{t.note}</p>}
        </div>
        <span className="chip whitespace-nowrap text-xs" style={{ minHeight: 28 }}>{ETIQUETA_ESTADO[t.status]}</span>
      </div>

      {abierto && (
        <div className="flex flex-wrap gap-2">
          <button className="boton-chico" disabled={enviando} onClick={onCobrar}>Cobrar</button>
          {t.status === "SCHEDULED" && <button className="chip" disabled={enviando} onClick={() => llamar("finish_appointment", { p_appointment: t.id })}>Terminar</button>}
          <button className="chip" disabled={enviando} onClick={() => llamar("cancel_appointment", { p_appointment: t.id, p_reason: null, p_no_show: true })}>No vino</button>
          <button className="chip" disabled={enviando} onClick={cancelar}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

function NuevoTurno({ yo, equipo, fecha, servicios, clientes, hayClientes, onListo }: {
  yo: Membresia; equipo: Membresia[]; fecha: string; servicios: Servicio[]; clientes: Cliente[]; hayClientes: boolean; onListo: () => void;
}) {
  const gestion = yo.role !== "BARBER";
  const [barbero, setBarbero] = useState(yo.id);
  const [dia, setDia] = useState(fecha);
  const [hora, setHora] = useState("10:00");
  const [servicio, setServicio] = useState<string | null>(null);
  const [cliente, setCliente] = useState("");
  const [nombreLibre, setNombreLibre] = useState("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = useRef<string>(crypto.randomUUID());

  async function guardar() {
    const inicio = fechaHoraAIso(dia, hora);
    if (!inicio) { setError("Elegí una fecha y una hora válidas."); return; }
    setEnviando(true);
    setError(null);
    const { error: e } = await getSupabase().rpc("create_appointment", {
      p_business: yo.business_id, p_barber_membership: barbero, p_starts_at: inicio, p_idempotency_key: clave.current,
      p_service: servicio, p_client: cliente || null, p_client_name: cliente ? null : nombreLibre || null, p_note: nota || null,
    });
    setEnviando(false);
    if (e) setError(e.message); else onListo();
  }

  return (
    <div className="flex flex-col gap-3 tarjeta">
      {gestion && (
        <label className="flex flex-col gap-1 text-sm">Barbero
          <select className="campo" value={barbero} onChange={(e) => setBarbero(e.target.value)}>
            {equipo.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-sm">Día
          <input className="campo" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">Hora
          <select className="campo" value={hora} onChange={(e) => setHora(e.target.value)}>
            {horasDelDia().map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </label>
      </div>
      <div>
        <p className="mb-2 text-sm">Servicio (define la duración)</p>
        <div className="flex flex-wrap gap-2">
          {servicios.map((s) => (
            <button key={s.id} onClick={() => setServicio(servicio === s.id ? null : s.id)} className={`chip ${servicio === s.id ? "chip-activo" : ""}`}>
              {s.name} · {s.duration_minutes} min
            </button>
          ))}
          {servicios.length === 0 && <p className="texto-suave text-sm">Sin servicios cargados: el turno dura 30 minutos.</p>}
        </div>
      </div>
      {hayClientes && (
        <label className="flex flex-col gap-1 text-sm">Cliente
          <select className="campo" value={cliente} onChange={(e) => setCliente(e.target.value)}>
            <option value="">Sin ficha (escribir nombre)</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {!cliente && (
        <label className="flex flex-col gap-1 text-sm">Nombre del cliente
          <input className="campo" value={nombreLibre} maxLength={80} onChange={(e) => setNombreLibre(e.target.value)} />
        </label>
      )}
      <label className="flex flex-col gap-1 text-sm">Nota (opcional)
        <input className="campo" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} />
      </label>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="boton" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : "Agendar turno"}</button>
    </div>
  );
}
