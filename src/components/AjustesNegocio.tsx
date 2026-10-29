"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { mesActual } from "@/lib/periodos";
import { parsearMonto } from "@/lib/validacion";
import { DIAS_SEMANA } from "@/lib/turnos";
import { MODULOS, type DatosNegocio, type HorarioTrabajo, type Membresia, type Meta, type ModuloNegocio } from "@/lib/tipos";

const NOMBRE_PLAN = { BASICO: "Básico", INTERMEDIO: "Intermedio", AVANZADO: "Avanzado" } as const;

// Encender o apagar módulos. Apagar uno no borra sus datos: solo deja de mostrarse.
export function Modulos({ yo, negocio, onCambio }: { yo: Membresia; negocio: DatosNegocio; onCambio: () => void }) {
  const [elegidos, setElegidos] = useState<ModuloNegocio[]>(negocio.modulos);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function alternar(m: ModuloNegocio) {
    setMsg(null);
    setElegidos((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function guardar() {
    setEnviando(true);
    const { error } = await getSupabase().rpc("save_modules", { p_business: yo.business_id, p_enabled: elegidos, p_finish_setup: false });
    setEnviando(false);
    if (error) setMsg(error.message); else { setMsg("Guardado."); onCambio(); }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Módulos</h2>
      <p className="texto-suave text-sm">Plan {NOMBRE_PLAN[negocio.plan]}. Si apagás un módulo, sus datos se conservan y vuelven a verse al encenderlo.</p>
      <ul className="flex flex-col gap-2">
        {MODULOS.map((m) => (
          <li key={m.valor}>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={elegidos.includes(m.valor)} onChange={() => alternar(m.valor)} />
              <span><span className="block font-medium">{m.titulo}</span><span className="texto-suave">{m.detalle}</span></span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3">
        <button className="boton-chico" onClick={guardar} disabled={enviando}>Guardar módulos</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </section>
  );
}

// Meta de ventas del mes: del negocio y, si querés, de cada barbero. Vacío o 0 = sin meta.
export function Metas({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const mes = mesActual();
  const barberos = equipo.filter((m) => m.role === "BARBER");
  const [valores, setValores] = useState<Record<string, string> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("sales_goals").select("barber_membership_id,month,amount").eq("business_id", yo.business_id).eq("month", mes))
      .then(({ data }) => {
        if (!vivo) return;
        const v: Record<string, string> = {};
        for (const g of (data as Meta[]) ?? []) v[g.barber_membership_id ?? "negocio"] = String(g.amount);
        setValores(v);
      });
    return () => { vivo = false; };
  }, [yo.business_id, mes]);

  if (valores === null) return null;

  async function guardar() {
    setMsg(null);
    const claves = ["negocio", ...barberos.map((b) => b.id)];
    for (const k of claves) {
      const texto = (valores?.[k] ?? "").trim();
      const monto = texto === "" ? 0 : parsearMonto(texto);
      if (monto === null) { setMsg("Revisá los montos: pesos enteros, sin centavos ni signos."); return; }
      const { error } = await getSupabase().rpc("set_goal", { p_business: yo.business_id, p_membership: k === "negocio" ? null : k, p_month: mes, p_amount: monto });
      if (error) { setMsg(error.message); return; }
    }
    setMsg("Metas guardadas.");
  }

  const campo = (k: string, etiqueta: string) => (
    <label key={k} className="flex items-center justify-between gap-3 text-sm">
      {etiqueta}
      <input className="campo w-40" inputMode="numeric" placeholder="Sin meta" value={valores[k] ?? ""} onChange={(e) => setValores({ ...valores, [k]: e.target.value })} />
    </label>
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Metas de este mes</h2>
      {campo("negocio", "Meta del negocio")}
      {barberos.map((b) => campo(b.id, b.display_name))}
      <div className="flex items-center gap-3">
        <button className="boton-chico" onClick={guardar}>Guardar metas</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
      {valores.negocio && parsearMonto(valores.negocio) && <p className="texto-suave text-xs">Meta del negocio: {formatearARS(parsearMonto(valores.negocio) ?? 0)}</p>}
    </section>
  );
}

interface Franja { activo: boolean; desde: string; hasta: string }
const FRANJA_VACIA: Franja = { activo: false, desde: "09:00", hasta: "18:00" };

// Horarios de trabajo por persona (para que no se agenden turnos fuera de hora).
// Sin ningún día cargado no hay restricción.
export function Horarios({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const [persona, setPersona] = useState(equipo[0]?.id ?? "");
  const [franjas, setFranjas] = useState<Record<number, Franja> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!persona) return;
    let vivo = true;
    void Promise.resolve(getSupabase().from("working_hours").select("membership_id,weekday,start_time,end_time").eq("membership_id", persona).order("weekday"))
      .then(({ data }) => {
        if (!vivo) return;
        const f: Record<number, Franja> = {};
        for (const d of DIAS_SEMANA) f[d.valor] = { ...FRANJA_VACIA };
        for (const h of (data as HorarioTrabajo[]) ?? []) f[h.weekday] = { activo: true, desde: h.start_time.slice(0, 5), hasta: h.end_time.slice(0, 5) };
        setFranjas(f);
      });
    return () => { vivo = false; };
  }, [persona]);

  async function guardar() {
    if (!franjas) return;
    const horas = DIAS_SEMANA.filter((d) => franjas[d.valor].activo).map((d) => ({ weekday: d.valor, start: franjas[d.valor].desde, end: franjas[d.valor].hasta }));
    if (horas.some((h) => h.end <= h.start)) { setMsg("La hora de fin debe ser posterior a la de inicio."); return; }
    const { error } = await getSupabase().rpc("save_working_hours", { p_business: yo.business_id, p_membership: persona, p_hours: horas });
    setMsg(error ? error.message : "Horarios guardados.");
  }

  function cambiar(dia: number, parte: Partial<Franja>) {
    setMsg(null);
    setFranjas((prev) => (prev ? { ...prev, [dia]: { ...prev[dia], ...parte } } : prev));
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Horarios de trabajo</h2>
      <p className="texto-suave text-sm">Si no marcás ningún día, se pueden agendar turnos a cualquier hora.</p>
      <select className="campo" value={persona} onChange={(e) => { setFranjas(null); setPersona(e.target.value); }} aria-label="Persona">
        {equipo.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
      </select>
      {franjas && (
        <ul className="flex flex-col gap-2">
          {DIAS_SEMANA.map((d) => (
            <li key={d.valor} className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex w-28 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={franjas[d.valor].activo} onChange={(e) => cambiar(d.valor, { activo: e.target.checked })} />{d.largo}</label>
              {franjas[d.valor].activo && (
                <>
                  <input className="campo w-28" type="time" step={900} aria-label={`${d.largo} desde`} value={franjas[d.valor].desde} onChange={(e) => cambiar(d.valor, { desde: e.target.value })} />
                  <span>a</span>
                  <input className="campo w-28" type="time" step={900} aria-label={`${d.largo} hasta`} value={franjas[d.valor].hasta} onChange={(e) => cambiar(d.valor, { hasta: e.target.value })} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3">
        <button className="boton-chico" onClick={guardar} disabled={!franjas}>Guardar horarios</button>
        {msg && <span role="status" className="text-sm">{msg}</span>}
      </div>
    </section>
  );
}
