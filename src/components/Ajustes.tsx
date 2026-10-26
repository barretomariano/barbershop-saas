"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { parsearMonto, porcentajeABps } from "@/lib/validacion";
import type { ModeloComision, Membresia, Servicio } from "@/lib/tipos";

interface Props { yo: Membresia; equipo: Membresia[]; onCambio: () => void }

const MODELOS: { valor: ModeloComision; etiqueta: string }[] = [
  { valor: "PERCENT", etiqueta: "Porcentaje de cada venta" },
  { valor: "CHAIR_RENT", etiqueta: "Alquiler de silla (se queda con todo)" },
  { valor: "SALARY", etiqueta: "Sueldo fijo (0% por venta)" },
];

export default function Ajustes({ yo, equipo, onCambio }: Props) {
  const esOwner = yo.role === "OWNER";
  return (
    <div className="flex flex-col gap-8">
      <Servicios yo={yo} />
      {esOwner ? (
        <section className="flex flex-col gap-4">
          <h2 className="font-medium">Comisión de cada barbero</h2>
          {equipo.filter((m) => m.role === "BARBER").map((m) => <FilaComision key={m.id} m={m} onCambio={onCambio} />)}
          {equipo.filter((m) => m.role === "BARBER").length === 0 && <p className="texto-suave text-sm">Todavía no hay barberos en el equipo.</p>}
        </section>
      ) : (
        <p className="texto-suave text-sm">Las comisiones las configura el dueño.</p>
      )}
    </div>
  );
}

function FilaComision({ m, onCambio }: { m: Membresia; onCambio: () => void }) {
  const [modelo, setModelo] = useState<ModeloComision>(m.commission_model);
  const [pct, setPct] = useState(String(m.commission_bps / 100));
  const [msg, setMsg] = useState<string | null>(null);

  async function guardar() {
    const bps = modelo === "PERCENT" ? porcentajeABps(pct) : 0;
    if (bps === null) { setMsg("El porcentaje debe ser un número entero entre 0 y 100."); return; }
    const { error } = await getSupabase().from("memberships")
      .update({ commission_model: modelo, commission_bps: bps, commission_configured: true }).eq("id", m.id);
    if (error) setMsg("No se pudo guardar."); else { setMsg("Guardado."); onCambio(); }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-4" style={{ borderColor: "var(--linea)" }}>
      <p className="font-medium">{m.display_name} {!m.commission_configured && <span className="text-xs text-red-600">· sin configurar, no puede vender</span>}</p>
      <select className="campo" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloComision)}>
        {MODELOS.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
      </select>
      {modelo === "PERCENT" && (
        <label className="flex items-center gap-2 text-sm">
          Porcentaje para el barbero
          <input className="campo w-24" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} /> %
        </label>
      )}
      <div className="flex items-center gap-3">
        <button className="boton-chico" onClick={guardar}>Guardar</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </div>
  );
}

function Servicios({ yo }: { yo: Membresia }) {
  const [lista, setLista] = useState<Servicio[]>([]);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(
      getSupabase().from("services").select("id,business_id,name,default_price,active")
        .eq("business_id", yo.business_id).eq("active", true).order("name"),
    ).then(({ data }) => { if (vivo) setLista((data as Servicio[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, version]);

  async function agregar() {
    const p = parsearMonto(precio);
    if (!nombre.trim() || !p) { setError("Completá el nombre y un precio válido."); return; }
    const { error: e } = await getSupabase().from("services").insert({ business_id: yo.business_id, name: nombre.trim(), default_price: p });
    if (e) setError(e.message.includes("duplicate") ? "Ya existe un servicio con ese nombre." : "No se pudo guardar.");
    else { setError(null); setNombre(""); setPrecio(""); recargar(); }
  }

  async function quitar(id: string) {
    await getSupabase().from("services").update({ active: false }).eq("id", id);
    recargar();
  }

  if (yo.role === "BARBER") return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Servicios</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {lista.map((s) => (
          <li key={s.id} className="flex justify-between">
            <span>{s.name} · {formatearARS(s.default_price)}</span>
            <button className="text-xs underline" onClick={() => quitar(s.id)}>Quitar</button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <input className="campo flex-1" placeholder="Nombre (ej. Corte)" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="campo w-28" inputMode="numeric" placeholder="Precio" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        <button className="boton-chico" onClick={agregar}>Agregar</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
