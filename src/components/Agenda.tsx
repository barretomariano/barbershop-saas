"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { hoyAR } from "@/lib/periodos";
import { MEDIOS_PAGO, type Cliente, type Membresia, type Servicio, type Turno, type Venta } from "@/lib/tipos";
import { formatearARS } from "@/lib/dinero";
import {
  ETIQUETA_ESTADO, esPorCerrar, fechaHoraAIso, fechaLarga, horaCorta, horasDelDia, nombreCliente, sumarDias,
} from "@/lib/turnos";
import { anioDe, celdasDelMes, conAnio, conMes, fechaAR, maximoDelMes, mesDe, MESES_CORTO, nivelCarga, nombreMes, numeroDelDia, rangoMes, sumarMeses, ventanaAnios } from "@/lib/calendario";
import { Campo, Cargando, EncabezadoHoja, Fichas, Hoja, Icono, PieHoja, Segmentado } from "@/components/ui";
import type { TurnoACobrar } from "@/components/VentaModal";

interface Props { yo: Membresia; equipo: Membresia[]; hayClientes: boolean; onCobrar: (t: TurnoACobrar) => void; refresco: number; abrirNuevo: number }
interface Datos { mes: Turno[]; ventas: Venta[]; porCerrar: Turno[]; servicios: Servicio[]; clientes: Cliente[] }
type Item = { k: "turno"; t: Turno; at: number } | { k: "venta"; v: Venta; at: number };
type Modal = { modo: "nuevo" } | { modo: "editar"; t: Turno } | { modo: "cerrar" } | null;
const DURACIONES = [15, 30, 45, 60, 75, 90, 105, 120, 150, 180];

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

export default function Agenda({ yo, equipo, hayClientes, onCobrar, refresco, abrirNuevo }: Props) {
  const hoy = hoyAR();
  const [fecha, setFecha] = useState(hoy);
  const [mesVista, setMesVista] = useState(mesDe(hoy));
  const [filtro, setFiltro] = useState<string | null>(null); // dueño/encargado: un barbero; null = todos
  const [agrupar, setAgrupar] = useState<"barbero" | "hora">("barbero");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  // El botón flotante "Turno" vive en la pantalla principal: cada toque suma 1 y acá se abre el formulario.
  const [visto, setVisto] = useState(abrirNuevo);
  if (abrirNuevo !== visto) { setVisto(abrirNuevo); setModal({ modo: "nuevo" }); }

  useEffect(() => {
    let vivo = true;
    void cargar(yo, mesVista, hayClientes).then((r) => {
      if (!vivo) return;
      setError(r.error ? "No se pudo cargar la agenda." : null);
      setDatos(r);
    });
    return () => { vivo = false; };
  }, [yo, mesVista, hayClientes, version, refresco]);

  const gestion = yo.role !== "BARBER";
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";
  const barberoActivo = gestion ? filtro : null;

  // Los turnos cobrados ya tienen su venta: esa venta no se repite como renglón aparte.
  const { turnosPorDia, ventasPorDia, deTodos } = useMemo(() => {
    const t = new Map<string, Turno[]>();
    const v = new Map<string, Venta[]>();
    const todos = new Map<string, Turno[]>();
    const conTurno = new Set((datos?.mes ?? []).map((x) => x.sale_id).filter(Boolean));
    for (const x of datos?.mes ?? []) {
      const k = fechaAR(x.starts_at);
      todos.set(k, [...(todos.get(k) ?? []), x]);
      if (barberoActivo && x.barber_membership_id !== barberoActivo) continue;
      t.set(k, [...(t.get(k) ?? []), x]);
    }
    for (const x of datos?.ventas ?? []) {
      if (conTurno.has(x.id)) continue;
      if (barberoActivo && x.barber_membership_id !== barberoActivo) continue;
      const k = fechaAR(x.sold_at);
      v.set(k, [...(v.get(k) ?? []), x]);
    }
    return { turnosPorDia: t, ventasPorDia: v, deTodos: todos };
  }, [datos, barberoActivo]);

  if (!datos) return <Cargando />;

  const activo = (t: Turno) => t.status !== "CANCELED" && t.status !== "NO_SHOW";
  const delDia = turnosPorDia.get(fecha) ?? [];
  const activos = delDia.filter(activo);
  const otros = delDia.filter((t) => !activo(t));
  const items: Item[] = [
    ...activos.map((t): Item => ({ k: "turno", t, at: new Date(t.starts_at).getTime() })),
    ...(ventasPorDia.get(fecha) ?? []).map((v): Item => ({ k: "venta", v, at: new Date(v.sold_at).getTime() })),
  ].sort((a, b) => a.at - b.at);
  const idBarbero = (it: Item) => (it.k === "turno" ? it.t.barber_membership_id : it.v.barber_membership_id);
  const cobrados = activos.filter((t) => t.status === "PAID").length;
  const porCobrar = activos.filter((t) => esPorCerrar(t)).length;

  // Calendario: un número por día (turnos activos) para pintar cuán agendado está.
  const conteo = new Map<string, number>();
  const pendientes = new Map<string, number>();
  for (const [dia, ts] of turnosPorDia) {
    const act = ts.filter(activo);
    conteo.set(dia, act.length);
    pendientes.set(dia, act.filter((t) => esPorCerrar(t)).length);
  }
  const turnosDelDiaDe = (id: string) => (deTodos.get(fecha) ?? []).filter((t) => activo(t) && t.barber_membership_id === id).length;

  function elegirDia(d: string) { setFecha(d); setMesVista(mesDe(d)); }
  function elegirMes(m: string) { setMesVista(m); setFecha(m === mesDe(hoy) ? hoy : `${m}-01`); }

  function cobrar(t: Turno) {
    const s = datos?.servicios.find((x) => x.id === t.service_id);
    onCobrar({ id: t.id, cliente: nombreCliente(t), servicio: t.service_name ?? null, precio: s?.default_price ?? null, barbero: nombre(t.barber_membership_id) });
  }
  const tarjeta = (t: Turno, conFecha = false) => (
    <TarjetaTurno key={t.id} t={t} gestion={gestion && !barberoActivo} nombre={nombre} onCobrar={() => cobrar(t)} onEditar={() => setModal({ modo: "editar", t })}
      onCambio={recargar} onError={setError} conFecha={conFecha} />
  );
  const renderItem = (it: Item) => it.k === "turno" ? tarjeta(it.t) : <FilaVenta key={it.v.id} v={it.v} gestion={gestion && !barberoActivo} nombre={nombre} />;

  // Dueño viendo a todos: el día se parte por barbero (o en una sola lista por hora, a elección).
  const porBarbero = gestion && !barberoActivo && agrupar === "barbero";
  const grupos = porBarbero
    ? equipo.map((m) => ({ m, its: items.filter((it) => idBarbero(it) === m.id) })).filter((g) => g.its.length > 0)
    : [];

  return (
    <section className="flex flex-col gap-4">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {datos.porCerrar.length > 0 && (
        <button className="tarjeta tarjeta-click flex items-center justify-between gap-3" onClick={() => setModal({ modo: "cerrar" })}>
          <span>
            <span className="block font-bold">Por cerrar · {datos.porCerrar.length}</span>
            <span className="block text-sm" style={{ opacity: 0.75 }}>Turnos terminados o vencidos: cobralos o cancelalos</span>
          </span>
          <Icono nombre="siguiente" tam={20} />
        </button>
      )}

      {gestion && equipo.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="campo-etiqueta">Ver agenda de</p>
          <div className="filtro-barberos" role="group" aria-label="Barbero">
            <button className="chip" aria-pressed={!filtro} onClick={() => setFiltro(null)}>Todos <span className="cuenta">{(deTodos.get(fecha) ?? []).filter(activo).length}</span></button>
            {equipo.map((m) => (
              <button key={m.id} className="chip" aria-pressed={filtro === m.id} onClick={() => setFiltro(filtro === m.id ? null : m.id)}>
                {m.display_name.split(" ")[0]} <span className="cuenta">{turnosDelDiaDe(m.id)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Calendario mes={mesVista} fecha={fecha} hoy={hoy} conteo={conteo} pendientes={pendientes} ventasPorDia={ventasPorDia}
        onMes={elegirMes} onDia={elegirDia} />

      <div className="flex items-center justify-between gap-2">
        <button className="chip" style={{ width: 46, padding: 0 }} aria-label="Día anterior" onClick={() => elegirDia(sumarDias(fecha, -1))}><Icono nombre="volver" tam={18} /></button>
        <div className="text-center">
          <p className="titulo text-lg font-semibold capitalize">{fechaLarga(fecha)}</p>
          <p className="texto-suave text-xs">
            {activos.length === 0 ? "Sin turnos" : `${activos.length} ${activos.length === 1 ? "turno" : "turnos"}`}
            {cobrados > 0 ? ` · ${cobrados} cobrados` : ""}{porCobrar > 0 ? ` · ${porCobrar} por cobrar` : ""}
            {barberoActivo ? ` · ${nombre(barberoActivo)}` : ""}
          </p>
          {fecha !== hoy && <button className="text-xs font-semibold underline" onClick={() => elegirDia(hoy)}>Volver a hoy</button>}
        </div>
        <button className="chip" style={{ width: 46, padding: 0 }} aria-label="Día siguiente" onClick={() => elegirDia(sumarDias(fecha, 1))}><Icono nombre="siguiente" tam={18} /></button>
      </div>

      {gestion && !barberoActivo && items.length > 1 && (
        <Segmentado etiqueta="Cómo ordenar el día" valor={agrupar} onCambio={setAgrupar}
          opciones={[{ valor: "barbero", texto: "Por barbero" }, { valor: "hora", texto: "Por hora" }]} />
      )}

      {items.length === 0 && <p className="texto-suave text-sm">No hay turnos ni ventas este día.</p>}
      {porBarbero ? grupos.map((g) => (
        <div key={g.m.id} className="flex flex-col gap-3">
          <p className="titulo-tarjeta flex items-center gap-2"><span className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{g.m.display_name.slice(0, 1).toUpperCase()}</span>{g.m.display_name} · {g.its.length}</p>
          {g.its.map(renderItem)}
        </div>
      )) : items.map(renderItem)}

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
            barberoInicial={barberoActivo} turno={modal.modo === "editar" ? modal.t : null} onCerrar={() => setModal(null)} onListo={() => { setModal(null); recargar(); }} />
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

// Calendario del mes. El mes y el año se tocan para cambiarlos; cada día se pinta según cuán agendado está.
function Calendario({ mes, fecha, hoy, conteo, pendientes, ventasPorDia, onMes, onDia }: {
  mes: string; fecha: string; hoy: string; conteo: Map<string, number>; pendientes: Map<string, number>; ventasPorDia: Map<string, Venta[]>; onMes: (m: string) => void; onDia: (d: string) => void;
}) {
  const [panel, setPanel] = useState<"mes" | "anio" | null>(null);
  const [desplazamiento, setDesplazamiento] = useState(0);
  const maximo = maximoDelMes(conteo);
  const [nombreSolo] = nombreMes(mes).split(" de ");
  const anio = anioDe(mes);
  const alternar = (p: "mes" | "anio") => { setPanel(panel === p ? null : p); setDesplazamiento(0); };

  return (
    <div className="tarjeta flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <button className="chip" style={{ width: 44, padding: 0 }} aria-label="Mes anterior" onClick={() => { setPanel(null); onMes(sumarMeses(mes, -1)); }}><Icono nombre="volver" tam={18} /></button>
        <div className="flex items-center gap-1">
          <button className="chip-titulo capitalize" aria-expanded={panel === "mes"} onClick={() => alternar("mes")}>{nombreSolo}</button>
          <button className="chip-titulo" aria-expanded={panel === "anio"} onClick={() => alternar("anio")}>{anio}</button>
        </div>
        <button className="chip" style={{ width: 44, padding: 0 }} aria-label="Mes siguiente" onClick={() => { setPanel(null); onMes(sumarMeses(mes, 1)); }}><Icono nombre="siguiente" tam={18} /></button>
      </div>

      {panel === "mes" && (
        <div className="selector-grilla" role="group" aria-label="Elegir mes">
          {MESES_CORTO.map((nombre, i) => (
            <button key={nombre} className="chip" aria-pressed={mes === conMes(mes, i + 1)} onClick={() => { setPanel(null); onMes(conMes(mes, i + 1)); }}>{nombre}</button>
          ))}
        </div>
      )}

      {panel === "anio" && (
        <div className="flex flex-col gap-2">
          <div className="selector-grilla" role="group" aria-label="Elegir año">
            {ventanaAnios(anio, desplazamiento).map((a) => (
              <button key={a} className="chip" aria-pressed={a === anio} onClick={() => { setPanel(null); onMes(conAnio(mes, a)); }}>{a}</button>
            ))}
          </div>
          <div className="flex justify-between">
            <button className="text-sm font-semibold underline" onClick={() => setDesplazamiento(desplazamiento - 1)}>Años anteriores</button>
            <button className="text-sm font-semibold underline" onClick={() => setDesplazamiento(desplazamiento + 1)}>Años siguientes</button>
          </div>
        </div>
      )}

      {panel === null && (
        <>
          <div className="rejilla-semana" aria-hidden="true">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i} className="cabeza-dia">{d}</span>)}
          </div>
          <div className="rejilla-mes">
            {celdasDelMes(mes).map((d, i) => {
              if (!d) return <span key={`v${i}`} className="celda-dia" data-vacia="true" />;
              const turnos = conteo.get(d) ?? 0;
              const ventas = (ventasPorDia.get(d) ?? []).length;
              const porCerrar = pendientes.get(d) ?? 0;
              return (
                <button key={d} className="celda-dia" data-hoy={d === hoy} data-nivel={nivelCarga(turnos, maximo)} aria-pressed={d === fecha}
                  aria-label={`${numeroDelDia(d)}: ${turnos === 0 && ventas === 0 ? "sin movimientos" : `${turnos} turnos${ventas ? ` y ${ventas} ventas` : ""}`}`}
                  onClick={() => onDia(d)}>
                  <span>{numeroDelDia(d)}</span>
                  <span className="puntos">
                    {porCerrar > 0 && <span className="punto" data-tipo="pendiente" />}
                    {turnos > 0 && ventas > 0 && <span className="punto" data-tipo="venta" />}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: "var(--suave)" }}>
            <span className="flex items-center gap-1.5">Pocos
              {[1, 2, 3, 4].map((n) => <i key={n} className="leyenda-nivel" data-nivel={n} />)}
              Muchos turnos</span>
            <span className="flex items-center gap-1.5"><i className="punto" data-tipo="pendiente" style={{ display: "inline-block" }} /> por cobrar</span>
          </div>
        </>
      )}
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
function FormTurno({ yo, equipo, fecha, servicios, clientes, hayClientes, barberoInicial, turno, onCerrar, onListo }: {
  yo: Membresia; equipo: Membresia[]; fecha: string; servicios: Servicio[]; clientes: Cliente[]; hayClientes: boolean; barberoInicial: string | null; turno: Turno | null; onCerrar: () => void; onListo: () => void;
}) {
  const editando = turno !== null;
  const gestion = yo.role !== "BARBER";
  const minutosActuales = turno ? Math.round((new Date(turno.ends_at).getTime() - new Date(turno.starts_at).getTime()) / 60000) : 30;
  const [barbero, setBarbero] = useState(turno?.barber_membership_id ?? barberoInicial ?? yo.id);
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
