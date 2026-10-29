"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import type { Cliente, Membresia, Turno } from "@/lib/tipos";
import { ETIQUETA_ESTADO, telefonoParaWhatsApp } from "@/lib/turnos";

const COLS = "id,business_id,name,phone,notes,active";
const TELEFONO_OK = /^[0-9+() -]{6,20}$/;

export default function Clientes({ yo }: { yo: Membresia }) {
  const gestion = yo.role !== "BARBER";
  const [lista, setLista] = useState<Cliente[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [verInactivos, setVerInactivos] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("clients").select(COLS).eq("business_id", yo.business_id).order("name"))
      .then(({ data }) => { if (vivo) setLista((data as Cliente[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, version]);

  if (lista === null) return <p className="texto-suave">Cargando…</p>;
  const q = busqueda.trim().toLowerCase();
  const visibles = lista.filter((c) => (verInactivos || c.active) && (!q || c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)));

  return (
    <section className="flex flex-col gap-4">
      <input className="campo" placeholder="Buscar por nombre o teléfono" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      <button className="boton" onClick={() => setAgregando((v) => !v)}>{agregando ? "Cerrar" : "Nuevo cliente"}</button>
      {agregando && <FormCliente negocio={yo.business_id} onListo={() => { setAgregando(false); recargar(); }} />}

      {visibles.length === 0 && <p className="texto-suave text-sm">{lista.length === 0 ? "Todavía no cargaste clientes." : "No hay clientes con esa búsqueda."}</p>}
      <ul className="flex flex-col gap-2">
        {visibles.map((c) => (
          <li key={c.id} className="tarjeta">
            <button className="flex w-full items-center justify-between text-left" onClick={() => setAbierto(abierto === c.id ? null : c.id)} aria-expanded={abierto === c.id}>
              <span className="font-medium">{c.name}{!c.active && <span className="texto-suave text-xs"> · desactivado</span>}</span>
              <span className="texto-suave text-sm">{c.phone ?? ""}</span>
            </button>
            {abierto === c.id && <Ficha c={c} gestion={gestion} onCambio={recargar} />}
          </li>
        ))}
      </ul>
      {gestion && <button className="text-sm underline self-start" onClick={() => setVerInactivos((v) => !v)}>{verInactivos ? "Ocultar desactivados" : "Ver desactivados"}</button>}
    </section>
  );
}

function FormCliente({ negocio, onListo }: { negocio: string; onListo: () => void }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    if (!nombre.trim()) { setError("Escribí el nombre."); return; }
    if (telefono && !TELEFONO_OK.test(telefono)) { setError("El teléfono solo puede tener números, espacios, + ( ) y guiones (6 a 20 caracteres)."); return; }
    setEnviando(true);
    const { error: e } = await getSupabase().from("clients").insert({ business_id: negocio, name: nombre.trim(), phone: telefono.trim() || null, notes: notas.trim() || null });
    setEnviando(false);
    if (e) setError("No se pudo guardar el cliente."); else onListo();
  }

  return (
    <div className="flex flex-col gap-3 tarjeta">
      <input className="campo" placeholder="Nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      <input className="campo" placeholder="Teléfono (opcional)" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      <input className="campo" placeholder="Notas (opcional)" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button className="boton" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : "Guardar cliente"}</button>
    </div>
  );
}

interface VentaCliente { id: string; service_name: string | null; amount: number; sold_at: string; status: "VALID" | "CANCELED" }

function Ficha({ c, gestion, onCambio }: { c: Cliente; gestion: boolean; onCambio: () => void }) {
  const [nombre, setNombre] = useState(c.name);
  const [telefono, setTelefono] = useState(c.phone ?? "");
  const [notas, setNotas] = useState(c.notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [ventas, setVentas] = useState<VentaCliente[] | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);

  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    void Promise.all([
      sb.from("sales").select("id,service_name,amount,sold_at,status").eq("client_id", c.id).order("sold_at", { ascending: false }).limit(10),
      sb.from("appointments").select("*, clients(name,phone)").eq("client_id", c.id).order("starts_at", { ascending: false }).limit(10),
    ]).then(([v, t]) => {
      if (!vivo) return;
      setVentas((v.data as VentaCliente[]) ?? []);
      setTurnos((t.data as Turno[]) ?? []);
    });
    return () => { vivo = false; };
  }, [c.id]);

  async function guardar() {
    if (!nombre.trim()) { setMsg("El nombre no puede quedar vacío."); return; }
    if (telefono && !TELEFONO_OK.test(telefono)) { setMsg("Teléfono no válido."); return; }
    const { error } = await getSupabase().from("clients").update({ name: nombre.trim(), phone: telefono.trim() || null, notes: notas.trim() || null }).eq("id", c.id);
    if (error) setMsg("No se pudo guardar."); else { setMsg("Guardado."); onCambio(); }
  }

  async function alternarActivo() {
    const { error } = await getSupabase().from("clients").update({ active: !c.active }).eq("id", c.id);
    if (error) setMsg("No se pudo cambiar el estado."); else onCambio();
  }

  const wa = c.phone ? telefonoParaWhatsApp(c.phone) : null;

  return (
    <div className="mt-3 flex flex-col gap-3 border-t pt-3">
      <input className="campo" aria-label="Nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      <input className="campo" aria-label="Teléfono" inputMode="tel" placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      <input className="campo" aria-label="Notas" placeholder="Notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="boton-chico" onClick={guardar}>Guardar</button>
        {wa && <a className="chip inline-flex items-center" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
        {gestion && <button className="chip" onClick={alternarActivo}>{c.active ? "Desactivar" : "Reactivar"}</button>}
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>

      <div>
        <p className="mb-1 text-sm font-medium">Últimas visitas</p>
        {ventas === null ? <p className="texto-suave text-sm">Cargando…</p> : ventas.length === 0 ? <p className="texto-suave text-sm">Todavía no hay ventas con este cliente.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {ventas.map((v) => <li key={v.id} className="flex justify-between"><span>{formatearHora(v.sold_at)} · {v.service_name ?? "Sin servicio"}{v.status === "CANCELED" ? " (anulada)" : ""}</span><span>{formatearARS(v.amount)}</span></li>)}
          </ul>
        )}
      </div>
      {turnos.length > 0 && (
        <div>
          <p className="mb-1 text-sm font-medium">Turnos</p>
          <ul className="flex flex-col gap-1 text-sm">
            {turnos.map((t) => <li key={t.id} className="flex justify-between"><span>{formatearHora(t.starts_at)}</span><span className="texto-suave">{ETIQUETA_ESTADO[t.status]}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
