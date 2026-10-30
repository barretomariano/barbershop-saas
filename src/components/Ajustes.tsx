"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { parsearMonto, porcentajeABps } from "@/lib/validacion";
import type { ModeloComision, Membresia, Servicio } from "@/lib/tipos";
import { BotonAccion, Campo, EncabezadoHoja, Fichas, Hoja, Icono, PieHoja } from "@/components/ui";

const MODELOS: { valor: ModeloComision; etiqueta: string }[] = [
  { valor: "PERCENT", etiqueta: "Porcentaje de cada venta" },
  { valor: "CHAIR_RENT", etiqueta: "Alquiler de silla (se queda con todo)" },
  { valor: "SALARY", etiqueta: "Sueldo fijo (0% por venta)" },
];

export function Comisiones({ equipo, onCambio }: { equipo: Membresia[]; onCambio: () => void }) {
  const barberos = equipo.filter((m) => m.role === "BARBER");
  const [editando, setEditando] = useState<Membresia | null>(null);
  const resumen = (m: Membresia) =>
    !m.commission_configured ? "Sin configurar · no puede vender"
      : m.commission_model === "PERCENT" ? `${m.commission_bps / 100}% de cada venta`
      : m.commission_model === "CHAIR_RENT" ? `Alquiler de silla · ${formatearARS(m.fixed_monthly)} por mes`
      : `Sueldo fijo · ${formatearARS(m.fixed_monthly)} por mes`;
  return (
    <section className="flex flex-col gap-3">
      {barberos.map((m) => (
        <button key={m.id} className="tarjeta tarjeta-click flex items-center justify-between gap-3" onClick={() => setEditando(m)}>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{m.display_name}</span>
            <span className="block text-sm" style={{ color: m.commission_configured ? "var(--suave)" : "var(--peligro)" }}>{resumen(m)}</span>
          </span>
          <Icono nombre="editar" tam={18} className="texto-suave" />
        </button>
      ))}
      {barberos.length === 0 && <p className="texto-suave text-sm">Todavía no hay barberos en el equipo.</p>}
      {editando && (
        <Hoja titulo={`Comisión de ${editando.display_name}`} onCerrar={() => setEditando(null)}>
          <FormComision m={editando} onCerrar={() => setEditando(null)} onCambio={() => { setEditando(null); onCambio(); }} />
        </Hoja>
      )}
    </section>
  );
}

function FormComision({ m, onCerrar, onCambio }: { m: Membresia; onCerrar: () => void; onCambio: () => void }) {
  const [modelo, setModelo] = useState<ModeloComision>(m.commission_model);
  const [pct, setPct] = useState(String(m.commission_bps / 100));
  const [fijo, setFijo] = useState(m.fixed_monthly ? String(m.fixed_monthly) : "");
  const [msg, setMsg] = useState<string | null>(null);

  async function guardar() {
    const bps = modelo === "PERCENT" ? porcentajeABps(pct) : 0;
    if (bps === null) { setMsg("El porcentaje debe ser un número entero entre 0 y 100."); return; }
    const fijoNum = modelo === "PERCENT" || fijo.trim() === "" ? 0 : parsearMonto(fijo);
    if (fijoNum === null) { setMsg("El monto fijo debe ser en pesos enteros, sin centavos ni signos."); return; }
    const { error } = await getSupabase().from("memberships")
      .update({ commission_model: modelo, commission_bps: bps, commission_configured: true, fixed_monthly: fijoNum }).eq("id", m.id);
    if (error) setMsg("No se pudo guardar."); else onCambio();
  }

  return (
    <div className="formulario">
      <EncabezadoHoja titulo={m.display_name} detalle="Cómo se calcula lo que gana esta persona." onCerrar={onCerrar} />
      <div className="campo-grupo">
        <span className="campo-etiqueta">Modelo</span>
        <Fichas etiqueta="Modelo de comisión" columnas={1} valor={modelo} onCambio={setModelo} opciones={MODELOS.map((x) => ({ valor: x.valor, texto: x.etiqueta }))} />
      </div>
      {modelo === "PERCENT" ? (
        <Campo etiqueta="Porcentaje para el barbero (%)"><input className="campo" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} /></Campo>
      ) : (
        <Campo etiqueta={modelo === "CHAIR_RENT" ? "Alquiler de silla por mes" : "Sueldo por mes"}>
          <input className="campo" inputMode="numeric" placeholder="$ 0" value={fijo} onChange={(e) => setFijo(e.target.value)} />
        </Campo>
      )}
      <PieHoja>
        {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
        <button className="boton" onClick={guardar}>Guardar</button>
      </PieHoja>
    </div>
  );
}

export function Servicios({ yo, hayAgenda }: { yo: Membresia; hayAgenda: boolean }) {
  const [lista, setLista] = useState<Servicio[]>([]);
  const [modal, setModal] = useState<Servicio | "nuevo" | null>(null);
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(
      getSupabase().from("services").select("id,business_id,name,default_price,duration_minutes,active")
        .eq("business_id", yo.business_id).eq("active", true).order("name"),
    ).then(({ data }) => { if (vivo) setLista((data as Servicio[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, version]);

  if (yo.role === "BARBER") return null;
  return (
    <section className="flex flex-col gap-3">
      <BotonAccion texto="Agregar servicio" onClick={() => setModal("nuevo")} />
      {lista.length === 0 && <p className="texto-suave text-sm">Todavía no cargaste servicios.</p>}
      <ul className="grupo-ajustes">
        {lista.map((s) => (
          <li key={s.id}>
            <button className="fila-ajuste" onClick={() => setModal(s)}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{s.name}</span>
                {hayAgenda && <span className="texto-suave text-sm">{s.duration_minutes} min</span>}
              </span>
              <span className="monto text-lg">{formatearARS(s.default_price)}</span>
              <Icono nombre="editar" tam={16} className="texto-suave" />
            </button>
          </li>
        ))}
      </ul>
      {modal && (
        <Hoja titulo={modal === "nuevo" ? "Nuevo servicio" : "Editar servicio"} onCerrar={() => setModal(null)}>
          <FormServicio negocio={yo.business_id} servicio={modal === "nuevo" ? null : modal} hayAgenda={hayAgenda}
            onCerrar={() => setModal(null)} onListo={() => { setModal(null); recargar(); }} />
        </Hoja>
      )}
    </section>
  );
}

function FormServicio({ negocio, servicio, hayAgenda, onCerrar, onListo }: { negocio: string; servicio: Servicio | null; hayAgenda: boolean; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState(servicio?.name ?? "");
  const [precio, setPrecio] = useState(servicio ? String(servicio.default_price) : "");
  const [duracion, setDuracion] = useState(servicio?.duration_minutes ?? 30);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    const p = parsearMonto(precio);
    if (!nombre.trim() || !p) { setError("Completá el nombre y un precio válido."); return; }
    setEnviando(true);
    const sb = getSupabase();
    const datos = { name: nombre.trim(), default_price: p, duration_minutes: duracion };
    const { error: e } = servicio
      ? await sb.from("services").update(datos).eq("id", servicio.id)
      : await sb.from("services").insert({ business_id: negocio, ...datos });
    setEnviando(false);
    if (e) setError(e.message.includes("duplicate") ? "Ya existe un servicio con ese nombre." : "No se pudo guardar.");
    else onListo();
  }

  async function quitar() {
    if (!servicio || !window.confirm(`¿Quitar "${servicio.name}"? Las ventas ya hechas no cambian.`)) return;
    await getSupabase().from("services").update({ active: false }).eq("id", servicio.id);
    onListo();
  }

  return (
    <div className="formulario">
      <EncabezadoHoja titulo={servicio ? "Editar servicio" : "Nuevo servicio"} onCerrar={onCerrar} />
      <Campo etiqueta="Nombre"><input className="campo" placeholder="Ej. Corte" maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
      <Campo etiqueta="Precio"><input className="campo" inputMode="numeric" placeholder="$ 0" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo>
      {hayAgenda && (
        <Campo etiqueta="Duración">
          <select className="campo" value={duracion} onChange={(e) => setDuracion(Number(e.target.value))}>
            {[15, 30, 45, 60, 75, 90, 120].map((d) => <option key={d} value={d}>{d} minutos</option>)}
          </select>
        </Campo>
      )}
      <PieHoja>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="boton" onClick={guardar} disabled={enviando}>{enviando ? "Guardando…" : "Guardar"}</button>
        {servicio && <button className="chip" style={{ color: "var(--peligro)" }} onClick={quitar}>Quitar servicio</button>}
      </PieHoja>
    </div>
  );
}
