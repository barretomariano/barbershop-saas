"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { explicarMontoInvalido, parsearMonto } from "@/lib/validacion";
import { hoyAR } from "@/lib/periodos";
import {
  MEDIOS_PAGO, type Cliente, type MedioPago, type Membresia, type Servicio, type Turno,
} from "@/lib/tipos";
import {
  ETIQUETA_ESTADO, esPorCerrar, fechaHoraAIso, fechaLarga, horaCorta, horasDelDia, nombreCliente, rangoDia, sumarDias,
} from "@/lib/turnos";

interface Props { yo: Membresia; equipo: Membresia[]; hayClientes: boolean }
interface Datos { dia: Turno[]; porCerrar: Turno[]; servicios: Servicio[]; clientes: Cliente[] }

const TURNO = "*, clients(name,phone)";

async function cargar(yo: Membresia, fecha: string, hayClientes: boolean): Promise<Datos & { error: boolean }> {
  const sb = getSupabase();
  const rango = rangoDia(fecha);
  const ahora = new Date().toISOString();
  const [d, c, s, cl] = await Promise.all([
    rango
      ? sb.from("appointments").select(TURNO).eq("business_id", yo.business_id).gte("starts_at", rango.desde).lt("starts_at", rango.hasta).order("starts_at")
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
    dia: (d.data as Turno[]) ?? [],
    porCerrar: ((c.data as Turno[]) ?? []).filter((t) => esPorCerrar(t)),
    servicios: (s.data as Servicio[]) ?? [],
    clientes: (cl.data as Cliente[]) ?? [],
  };
}

export default function Agenda({ yo, equipo, hayClientes }: Props) {
  const [fecha, setFecha] = useState(hoyAR());
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void cargar(yo, fecha, hayClientes).then((r) => {
      if (!vivo) return;
      setError(r.error ? "No se pudo cargar la agenda." : null);
      setDatos(r);
    });
    return () => { vivo = false; };
  }, [yo, fecha, hayClientes, version]);

  const gestion = yo.role !== "BARBER";
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";
  if (!datos) return <p className="texto-suave">Cargando…</p>;

  const activos = datos.dia.filter((t) => t.status !== "CANCELED" && t.status !== "NO_SHOW");
  const otros = datos.dia.filter((t) => t.status === "CANCELED" || t.status === "NO_SHOW");

  return (
    <section className="flex flex-col gap-5">
      {datos.porCerrar.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-medium">Por cerrar ({datos.porCerrar.length})</h2>
          <p className="texto-suave text-sm">Turnos terminados o con la hora vencida: cobralos o cancelalos.</p>
          {datos.porCerrar.map((t) => (
            <TarjetaTurno key={t.id} t={t} gestion={gestion} nombre={nombre} servicios={datos.servicios} onCambio={recargar} onError={setError} conFecha />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <button className="chip" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}>←</button>
        <div className="text-center">
          <p className="font-medium capitalize">{fechaLarga(fecha)}</p>
          {fecha !== hoyAR() && <button className="text-xs underline" onClick={() => setFecha(hoyAR())}>Volver a hoy</button>}
        </div>
        <button className="chip" aria-label="Día siguiente" onClick={() => setFecha(sumarDias(fecha, 1))}>→</button>
      </div>

      <button className="boton" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cerrar" : "Nuevo turno"}</button>
      {nuevo && (
        <NuevoTurno yo={yo} equipo={equipo} fecha={fecha} servicios={datos.servicios} clientes={datos.clientes} hayClientes={hayClientes}
          onListo={() => { setNuevo(false); recargar(); }} />
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {activos.length === 0 && <p className="texto-suave text-sm">No hay turnos este día.</p>}
      {activos.map((t) => (
        <TarjetaTurno key={t.id} t={t} gestion={gestion} nombre={nombre} servicios={datos.servicios} onCambio={recargar} onError={setError} />
      ))}
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

function TarjetaTurno({ t, gestion, nombre, servicios, onCambio, onError, conFecha }: {
  t: Turno; gestion: boolean; nombre: (id: string) => string; servicios: Servicio[]; onCambio: () => void; onError: (m: string | null) => void; conFecha?: boolean;
}) {
  const [cobrando, setCobrando] = useState(false);
  const [monto, setMonto] = useState(() => {
    const s = servicios.find((x) => x.id === t.service_id);
    return s ? String(s.default_price) : "";
  });
  const [medio, setMedio] = useState<MedioPago>("EFECTIVO");
  const [enviando, setEnviando] = useState(false);
  const clave = useRef<string>(crypto.randomUUID()); // misma clave hasta cobrar: un doble toque no duplica
  const montoNum = parsearMonto(monto);
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
    <div className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: "var(--linea)" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{fechaTxt}{horaCorta(t.starts_at)}–{horaCorta(t.ends_at)} · {nombreCliente(t)}</p>
          <p className="texto-suave text-sm">{t.service_name ?? "Sin servicio"}{gestion ? ` · ${nombre(t.barber_membership_id)}` : ""}</p>
          {t.note && <p className="texto-suave text-sm">{t.note}</p>}
        </div>
        <span className="chip whitespace-nowrap text-xs" style={{ minHeight: 28 }}>{ETIQUETA_ESTADO[t.status]}</span>
      </div>

      {abierto && !cobrando && (
        <div className="flex flex-wrap gap-2">
          {t.status === "SCHEDULED" && <button className="chip" disabled={enviando} onClick={() => llamar("finish_appointment", { p_appointment: t.id })}>Terminar</button>}
          <button className="boton-chico" disabled={enviando} onClick={() => setCobrando(true)}>Cobrar</button>
          <button className="chip" disabled={enviando} onClick={() => llamar("cancel_appointment", { p_appointment: t.id, p_reason: null, p_no_show: true })}>No vino</button>
          <button className="chip" disabled={enviando} onClick={cancelar}>Cancelar</button>
        </div>
      )}

      {abierto && cobrando && (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Monto cobrado
            <input className="campo" inputMode="numeric" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="$ 0" />
            {explicarMontoInvalido(monto) && <span role="alert" className="text-red-600">{explicarMontoInvalido(monto)}</span>}
          </label>
          <div className="flex flex-wrap gap-2">
            {MEDIOS_PAGO.map((m) => <button key={m.valor} onClick={() => setMedio(m.valor)} className={`chip ${medio === m.valor ? "chip-activo" : ""}`}>{m.etiqueta}</button>)}
          </div>
          <div className="flex gap-2">
            <button className="boton-chico" disabled={enviando || !montoNum}
              onClick={() => llamar("charge_appointment", { p_appointment: t.id, p_amount: montoNum, p_payment: medio, p_idempotency_key: clave.current })}>
              {enviando ? "Guardando…" : `Cobrar ${montoNum ? formatearARS(montoNum) : ""}`}
            </button>
            <button className="chip" onClick={() => setCobrando(false)}>Volver</button>
          </div>
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
    <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--linea)" }}>
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
