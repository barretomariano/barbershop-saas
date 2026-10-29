"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { explicarMontoInvalido, parsearMonto } from "@/lib/validacion";
import { MEDIOS_PAGO, type Cliente, type MedioPago, type Membresia, type Servicio } from "@/lib/tipos";
import {
  ESTADO_INICIAL, pasoAlcanzable, pasoCompleto, pasosDeVenta, siguientePaso, ventaLista, type EstadoVenta, type Paso,
} from "@/lib/venta";
import { EncabezadoHoja, Hoja, Icono } from "@/components/ui";

// Datos de un turno que se está cobrando: el servicio y el cliente ya vienen definidos por el turno.
export interface TurnoACobrar { id: string; cliente: string; servicio: string | null; precio: number | null; barbero: string }

interface Props {
  yo: Membresia;
  equipo: Membresia[];
  hayClientes: boolean;
  turno?: TurnoACobrar | null;
  onCerrar: () => void;
  onRegistrada: () => void;
}
interface Resultado { amount: number; barber_amount: number | null; local_amount: number | null }

const ROTULO: Record<Exclude<Paso, "confirmar">, string> = { servicio: "Servicio", pago: "Medio de pago", cliente: "Cliente", nota: "Nota" };
const etiquetaMedio = (m: MedioPago | null) => MEDIOS_PAGO.find((x) => x.valor === m)?.etiqueta ?? "";

export default function VentaModal({ yo, equipo, hayClientes, turno = null, onCerrar, onRegistrada }: Props) {
  const gestion = yo.role !== "BARBER";
  const pasos = useMemo(() => pasosDeVenta(hayClientes, Boolean(turno)), [hayClientes, turno]);
  const inicial = useMemo<EstadoVenta>(() => (turno ? { ...ESTADO_INICIAL, monto: turno.precio ? String(turno.precio) : "", otroMonto: true } : ESTADO_INICIAL), [turno]);

  const [e, setE] = useState<EstadoVenta>(inicial);
  const [paso, setPaso] = useState<Paso>(() => siguientePaso(pasos, inicial));
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [barbero, setBarbero] = useState(yo.id);
  const [editandoMonto, setEditandoMonto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  // Misma clave hasta que la venta se guarde: un doble toque no la duplica.
  const clave = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (turno) return;
    let vivo = true;
    void Promise.resolve(getSupabase().from("services").select("id,business_id,name,default_price,duration_minutes,active")
      .eq("business_id", yo.business_id).eq("active", true).order("name"))
      .then(({ data }) => { if (vivo) setServicios((data as Servicio[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, turno]);

  useEffect(() => {
    if (!hayClientes || turno) return;
    let vivo = true;
    void Promise.resolve(getSupabase().from("clients").select("id,business_id,name,phone,notes,active")
      .eq("business_id", yo.business_id).eq("active", true).order("name"))
      .then(({ data }) => { if (vivo) setClientes((data as Cliente[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, hayClientes, turno]);

  const montoNum = parsearMonto(e.monto);
  const listo = ventaLista(pasos, e);

  // Aplica un cambio y salta al primer paso que falte.
  function aplicar(cambio: Partial<EstadoVenta>, avanzar = true) {
    const nuevo = { ...e, ...cambio };
    setE(nuevo);
    setError(null);
    if (avanzar) setPaso(siguientePaso(pasos, nuevo));
  }

  const valorDe = (p: Exclude<Paso, "confirmar">): string => {
    if (p === "servicio") {
      if (!pasoCompleto(p, e) || montoNum === null) return "Elegí qué se hizo";
      const s = servicios.find((x) => x.id === e.servicioId);
      return `${s?.name ?? "Otro monto"} · ${formatearARS(montoNum)}`;
    }
    if (p === "pago") return e.medio ? etiquetaMedio(e.medio) : "Cómo pagó";
    if (p === "cliente") return e.clienteElegido ? (clientes.find((c) => c.id === e.clienteId)?.name ?? "Sin cliente") : "Quién fue atendido";
    return e.notaHecha ? (e.nota.trim() || "Sin nota") : "Algo para recordar";
  };

  async function registrar() {
    if (!montoNum || !e.medio || enviando) return;
    setEnviando(true);
    setError(null);
    const sb = getSupabase();
    if (turno) {
      const { error: err } = await sb.rpc("charge_appointment", { p_appointment: turno.id, p_amount: montoNum, p_payment: e.medio, p_idempotency_key: clave.current });
      setEnviando(false);
      if (err) { setError(err.message); return; }
      setResultado({ amount: montoNum, barber_amount: null, local_amount: null });
      onRegistrada();
      return;
    }
    const { data: id, error: err } = await sb.rpc("register_sale", {
      p_business: yo.business_id, p_barber_membership: barbero, p_amount: montoNum, p_payment: e.medio,
      p_idempotency_key: clave.current, p_service: e.servicioId, p_client: e.clienteId || null, p_note: e.nota.trim() || null,
    });
    if (err) { setError(err.message); setEnviando(false); return; }
    const { data: venta } = await sb.from("sales").select("amount,barber_amount,local_amount").eq("id", id).single();
    setResultado((venta as Resultado | null) ?? { amount: montoNum, barber_amount: null, local_amount: null });
    setEnviando(false);
    onRegistrada();
  }

  function otraVenta() {
    clave.current = crypto.randomUUID();
    setE(ESTADO_INICIAL);
    setPaso("servicio");
    setResultado(null);
    setBusqueda("");
    setEditandoMonto(false);
  }

  const titulo = turno ? "Cobrar turno" : "Nueva venta";

  if (resultado) {
    return (
      <Hoja titulo={titulo} onCerrar={onCerrar}>
        <div role="status" className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="grid place-items-center rounded-full" style={{ width: 68, height: 68, background: "var(--acento)", color: "var(--tinta-acento)" }}>
            <Icono nombre="check" tam={34} />
          </span>
          <p className="texto-suave text-sm">Venta registrada</p>
          <p className="monto text-5xl">{formatearARS(resultado.amount)}</p>
          {resultado.barber_amount !== null && resultado.local_amount !== null && (
            <p className="texto-suave text-sm">
              {gestion ? `Barbero ${formatearARS(resultado.barber_amount)} · Local ${formatearARS(resultado.local_amount)}` : `Te corresponden ${formatearARS(resultado.barber_amount)}`}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          {!turno && <button className="boton" onClick={otraVenta}>Registrar otra venta</button>}
          <button className={turno ? "boton" : "boton-fantasma"} style={turno ? undefined : { minHeight: 52 }} onClick={onCerrar}>Listo</button>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja titulo={titulo} onCerrar={onCerrar}>
      <EncabezadoHoja titulo={titulo} detalle={turno ? `${turno.cliente}${turno.servicio ? ` · ${turno.servicio}` : ""}` : "Un paso por vez, sin vueltas."} onCerrar={onCerrar} />

      {gestion && !turno && (
        <label className="mb-3 flex items-center justify-between gap-3 text-sm">
          <span className="texto-suave font-semibold">Atendió</span>
          <select className="campo" style={{ width: "auto", minWidth: 150, minHeight: 42 }} value={barbero} onChange={(ev) => setBarbero(ev.target.value)}>
            {equipo.map((b) => <option key={b.id} value={b.id}>{b.display_name}</option>)}
          </select>
        </label>
      )}

      <div className="flex flex-col gap-2">
        {pasos.map((p, i) => {
          const hecho = pasoCompleto(p, e);
          const alcanzable = pasoAlcanzable(pasos, p, e);
          const estado = paso === p ? "activo" : hecho ? "hecho" : "bloqueado";
          return (
            <div key={p} className="flex flex-col gap-2">
              <button className="paso" data-estado={estado} disabled={estado === "bloqueado" || !alcanzable}
                aria-expanded={paso === p} onClick={() => setPaso(p)}>
                <span className="paso-num">{hecho && paso !== p ? <Icono nombre="check" tam={14} /> : i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="texto-suave text-xs font-semibold">{ROTULO[p]}</span>
                  <span className="truncate text-[15px] font-semibold" style={{ color: hecho ? "var(--texto)" : "var(--suave)" }}>{valorDe(p)}</span>
                </span>
                {hecho && paso !== p && <span className="texto-suave text-xs font-semibold">Cambiar</span>}
              </button>

              {paso === p && p === "servicio" && (
                <PanelServicio servicios={servicios} e={e} montoInvalido={explicarMontoInvalido(e.monto)} montoOk={montoNum !== null}
                  onServicio={(s) => aplicar({ servicioId: s.id, otroMonto: false, monto: String(s.default_price) })}
                  onOtro={() => setE({ ...e, servicioId: null, otroMonto: true, monto: "" })}
                  onMonto={(m) => setE({ ...e, monto: m })}
                  onContinuar={() => aplicar({})} />
              )}
              {paso === p && p === "pago" && (
                <div className="grid grid-cols-2 gap-2">
                  {MEDIOS_PAGO.map((m) => (
                    <button key={m.valor} className="opcion" aria-pressed={e.medio === m.valor} onClick={() => aplicar({ medio: m.valor })}>
                      <span className="font-semibold">{m.etiqueta}</span>
                    </button>
                  ))}
                </div>
              )}
              {paso === p && p === "cliente" && (
                <PanelCliente clientes={clientes} busqueda={busqueda} onBusqueda={setBusqueda}
                  onElegir={(id) => aplicar({ clienteElegido: true, clienteId: id })} />
              )}
              {paso === p && p === "nota" && (
                <div className="flex flex-col gap-2">
                  <textarea className="campo" maxLength={200} placeholder="Ej. Pidió la máquina en 2, vuelve en 3 semanas" value={e.nota}
                    onChange={(ev) => setE({ ...e, nota: ev.target.value })} aria-label="Nota de la venta" />
                  <div className="flex gap-2">
                    <button className="boton-fantasma flex-1" style={{ minHeight: 48 }} onClick={() => aplicar({ nota: "", notaHecha: true })}>Omitir</button>
                    <button className="boton-chico flex-1" style={{ minHeight: 48 }} disabled={!e.nota.trim()} onClick={() => aplicar({ notaHecha: true })}>Continuar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {paso === "confirmar" && listo && montoNum !== null && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 rounded-[24px] p-4" style={{ background: "var(--sup-2)" }}>
            <div>
              <p className="texto-suave text-xs font-semibold">Total a cobrar</p>
              {editandoMonto ? (
                <input className="campo mt-1 text-xl" style={{ width: 170 }} inputMode="numeric" autoFocus value={e.monto}
                  onChange={(ev) => setE({ ...e, monto: ev.target.value })} onBlur={() => { if (montoNum) setEditandoMonto(false); }} aria-label="Monto cobrado" />
              ) : (
                <p className="monto text-4xl">{formatearARS(montoNum)}</p>
              )}
            </div>
            <button className="boton-fantasma inline-flex items-center gap-2" onClick={() => setEditandoMonto((v) => !v)}>
              <Icono nombre="editar" tam={16} /> {editandoMonto ? "Listo" : "Editar monto"}
            </button>
          </div>
          {explicarMontoInvalido(e.monto) && <p role="alert" className="text-sm text-red-600">{explicarMontoInvalido(e.monto)}</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button className="boton" onClick={registrar} disabled={enviando || !montoNum}>{enviando ? "Registrando…" : turno ? "Cobrar turno" : "Registrar venta"}</button>
        </div>
      )}
      {paso !== "confirmar" && error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </Hoja>
  );
}

function PanelServicio({ servicios, e, montoInvalido, montoOk, onServicio, onOtro, onMonto, onContinuar }: {
  servicios: Servicio[]; e: EstadoVenta; montoInvalido: string | null; montoOk: boolean;
  onServicio: (s: Servicio) => void; onOtro: () => void; onMonto: (m: string) => void; onContinuar: () => void;
}) {
  const soloMonto = servicios.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {!soloMonto && (
        <div className="grid grid-cols-2 gap-2">
          {servicios.map((s) => (
            <button key={s.id} className="opcion" aria-pressed={e.servicioId === s.id} onClick={() => onServicio(s)}>
              <span className="font-semibold">{s.name}</span>
              <span className="texto-suave text-sm">{formatearARS(s.default_price)}</span>
            </button>
          ))}
          <button className="opcion" aria-pressed={e.otroMonto} onClick={onOtro}>
            <span className="font-semibold">Otro monto</span>
            <span className="texto-suave text-sm">Lo escribo yo</span>
          </button>
        </div>
      )}
      {(soloMonto || e.otroMonto) && (
        <div className="flex flex-col gap-2">
          {soloMonto && <p className="texto-suave text-sm">Todavía no hay servicios cargados: ingresá el monto a mano.</p>}
          <input className="campo text-2xl" inputMode="numeric" placeholder="$ 0" autoFocus value={e.monto}
            onChange={(ev) => onMonto(ev.target.value)} aria-label="Monto cobrado" />
          {montoInvalido && <p role="alert" className="text-sm text-red-600">{montoInvalido}</p>}
          <button className="boton-chico" style={{ minHeight: 48 }} disabled={!montoOk} onClick={() => { if (soloMonto) onOtro(); onContinuar(); }}>Continuar</button>
        </div>
      )}
    </div>
  );
}

function PanelCliente({ clientes, busqueda, onBusqueda, onElegir }: {
  clientes: Cliente[]; busqueda: string; onBusqueda: (t: string) => void; onElegir: (id: string) => void;
}) {
  const filtrados = clientes.filter((c) => c.name.toLowerCase().includes(busqueda.trim().toLowerCase())).slice(0, 8);
  return (
    <div className="flex flex-col gap-2">
      <button className="opcion" style={{ minHeight: 52 }} onClick={() => onElegir("")}><span className="font-semibold">Sin cliente</span></button>
      {clientes.length > 5 && <input className="campo" style={{ minHeight: 46 }} placeholder="Buscar por nombre" value={busqueda} onChange={(ev) => onBusqueda(ev.target.value)} aria-label="Buscar cliente" />}
      <div className="grid grid-cols-2 gap-2">
        {filtrados.map((c) => (
          <button key={c.id} className="opcion" style={{ minHeight: 52 }} onClick={() => onElegir(c.id)}>
            <span className="truncate font-semibold">{c.name}</span>
          </button>
        ))}
      </div>
      {clientes.length > 0 && filtrados.length === 0 && <p className="texto-suave text-sm">Nadie coincide con esa búsqueda.</p>}
    </div>
  );
}
