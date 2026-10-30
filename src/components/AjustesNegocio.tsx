"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { mesActual } from "@/lib/periodos";
import { parsearMonto } from "@/lib/validacion";
import { DIAS_SEMANA } from "@/lib/turnos";
import { MODULOS, type DatosNegocio, type HorarioTrabajo, type Membresia, type Meta, type ModuloNegocio } from "@/lib/tipos";
import { Campo, EncabezadoHoja, Fichas, Hoja, Icono, PieHoja, Segmentado } from "@/components/ui";

const NOMBRE_PLAN = { BASICO: "Básico", INTERMEDIO: "Intermedio", AVANZADO: "Avanzado" } as const;

// Encender o apagar módulos. Apagar uno no borra sus datos: solo deja de mostrarse. Cada interruptor guarda al instante.
export function Modulos({ yo, negocio, onCambio }: { yo: Membresia; negocio: DatosNegocio; onCambio: () => void }) {
  const [elegidos, setElegidos] = useState<ModuloNegocio[]>(negocio.modulos);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function alternar(m: ModuloNegocio) {
    if (enviando) return;
    const previos = elegidos;
    const nuevos = previos.includes(m) ? previos.filter((x) => x !== m) : [...previos, m];
    setElegidos(nuevos);
    setEnviando(true);
    setMsg(null);
    const { error } = await getSupabase().rpc("save_modules", { p_business: yo.business_id, p_enabled: nuevos, p_finish_setup: false });
    setEnviando(false);
    if (error) { setElegidos(previos); setMsg(error.message); } else onCambio();
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="texto-suave text-sm">Plan {NOMBRE_PLAN[negocio.plan]}. Si apagás un módulo, sus datos se conservan y vuelven a verse al encenderlo.</p>
      <ul className="grupo-ajustes">
        {MODULOS.map((m) => {
          const activo = elegidos.includes(m.valor);
          return (
            <li key={m.valor}>
              <button className="fila-ajuste" role="switch" aria-checked={activo} onClick={() => void alternar(m.valor)}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{m.titulo}</span>
                  <span className="texto-suave text-sm">{m.detalle}</span>
                </span>
                <span className="interruptor" data-activo={activo} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
    </section>
  );
}

// Meta de ventas del mes: del negocio y, si querés, de cada barbero. Vacío o 0 = sin meta.
export function Metas({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const mes = mesActual();
  const barberos = equipo.filter((m) => m.role === "BARBER");
  const [valores, setValores] = useState<Record<string, number> | null>(null);
  const [editando, setEditando] = useState<{ clave: string; nombre: string } | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("sales_goals").select("barber_membership_id,month,amount").eq("business_id", yo.business_id).eq("month", mes))
      .then(({ data }) => {
        if (!vivo) return;
        const v: Record<string, number> = {};
        for (const g of (data as Meta[]) ?? []) v[g.barber_membership_id ?? "negocio"] = g.amount;
        setValores(v);
      });
    return () => { vivo = false; };
  }, [yo.business_id, mes, version]);

  if (valores === null) return null;
  const filas = [{ clave: "negocio", nombre: "Meta del negocio" }, ...barberos.map((b) => ({ clave: b.id, nombre: b.display_name }))];

  return (
    <section className="flex flex-col gap-3">
      <p className="texto-suave text-sm">Tocá una fila para definir o cambiar la meta de este mes.</p>
      <ul className="grupo-ajustes">
        {filas.map((f) => (
          <li key={f.clave}>
            <button className="fila-ajuste" onClick={() => setEditando(f)}>
              <span className="flex-1 font-semibold">{f.nombre}</span>
              <span className={valores[f.clave] ? "monto text-lg" : "texto-suave text-sm"}>{valores[f.clave] ? formatearARS(valores[f.clave]) : "Sin meta"}</span>
              <Icono nombre="editar" tam={16} className="texto-suave" />
            </button>
          </li>
        ))}
      </ul>
      {editando && (
        <Hoja titulo={editando.nombre} onCerrar={() => setEditando(null)}>
          <FormMeta negocio={yo.business_id} mes={mes} clave={editando.clave} nombre={editando.nombre} actual={valores[editando.clave] ?? 0}
            onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); setVersion((v) => v + 1); }} />
        </Hoja>
      )}
    </section>
  );
}

function FormMeta({ negocio, mes, clave, nombre, actual, onCerrar, onListo }: { negocio: string; mes: string; clave: string; nombre: string; actual: number; onCerrar: () => void; onListo: () => void }) {
  const [texto, setTexto] = useState(actual ? String(actual) : "");
  const [msg, setMsg] = useState<string | null>(null);
  async function guardar() {
    const monto = texto.trim() === "" ? 0 : parsearMonto(texto);
    if (monto === null) { setMsg("Revisá el monto: pesos enteros, sin centavos ni signos."); return; }
    const { error } = await getSupabase().rpc("set_goal", { p_business: negocio, p_membership: clave === "negocio" ? null : clave, p_month: mes, p_amount: monto });
    if (error) setMsg(error.message); else onListo();
  }
  return (
    <div className="formulario">
      <EncabezadoHoja titulo={nombre} detalle="Meta de ventas de este mes. Vacío = sin meta." onCerrar={onCerrar} />
      <Campo etiqueta="Monto"><input className="campo" inputMode="numeric" placeholder="$ 0" value={texto} onChange={(e) => setTexto(e.target.value)} /></Campo>
      <PieHoja>
        {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
        <button className="boton" onClick={guardar}>Guardar meta</button>
      </PieHoja>
    </div>
  );
}

interface Franja { activo: boolean; desde: string; hasta: string }
const FRANJA_VACIA: Franja = { activo: false, desde: "09:00", hasta: "18:00" };

// Horarios de trabajo por persona (para que no se agenden turnos fuera de hora).
// Sin ningún día cargado no hay restricción.
export function Horarios({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const [persona, setPersona] = useState(equipo[0]?.id ?? "");
  const [franjas, setFranjas] = useState<Record<number, Franja> | null>(null);
  const [dia, setDia] = useState<number | null>(null);
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

  // Guarda todos los días de la persona con el cambio de un día ya aplicado.
  async function guardarDia(valor: number, nueva: Franja): Promise<string | null> {
    if (!franjas) return "Todavía se están cargando los horarios.";
    const todas = { ...franjas, [valor]: nueva };
    const horas = DIAS_SEMANA.filter((d) => todas[d.valor].activo).map((d) => ({ weekday: d.valor, start: todas[d.valor].desde, end: todas[d.valor].hasta }));
    if (horas.some((h) => h.end <= h.start)) return "La hora de fin debe ser posterior a la de inicio.";
    const { error } = await getSupabase().rpc("save_working_hours", { p_business: yo.business_id, p_membership: persona, p_hours: horas });
    if (error) return error.message;
    setFranjas(todas);
    setMsg(null);
    return null;
  }

  const d = DIAS_SEMANA.find((x) => x.valor === dia);
  return (
    <section className="flex flex-col gap-3">
      <p className="texto-suave text-sm">Si no marcás ningún día, se pueden agendar turnos a cualquier hora.</p>
      {equipo.length > 1 && (
        <Segmentado etiqueta="Persona" valor={persona} onCambio={(p) => { setFranjas(null); setPersona(p); }}
          opciones={equipo.map((m) => ({ valor: m.id, texto: m.display_name.split(" ")[0] }))} />
      )}
      {franjas && (
        <ul className="grupo-ajustes">
          {DIAS_SEMANA.map((x) => (
            <li key={x.valor}>
              <button className="fila-ajuste" onClick={() => { setMsg(null); setDia(x.valor); }}>
                <span className="flex-1 font-semibold">{x.largo}</span>
                <span className={franjas[x.valor].activo ? "monto text-base" : "texto-suave text-sm"}>
                  {franjas[x.valor].activo ? `${franjas[x.valor].desde} a ${franjas[x.valor].hasta}` : "No trabaja"}
                </span>
                <Icono nombre="editar" tam={16} className="texto-suave" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {d && franjas && (
        <Hoja titulo={d.largo} onCerrar={() => setDia(null)}>
          <FormDia nombre={d.largo} inicial={franjas[d.valor]} onCerrar={() => setDia(null)}
            onGuardar={async (f) => { const e = await guardarDia(d.valor, f); if (!e) setDia(null); return e; }} />
        </Hoja>
      )}
    </section>
  );
}

function FormDia({ nombre, inicial, onCerrar, onGuardar }: { nombre: string; inicial: Franja; onCerrar: () => void; onGuardar: (f: Franja) => Promise<string | null> }) {
  const [activo, setActivo] = useState(inicial.activo);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="formulario">
      <EncabezadoHoja titulo={nombre} onCerrar={onCerrar} />
      <div className="campo-grupo">
        <span className="campo-etiqueta">¿Trabaja este día?</span>
        <Fichas etiqueta="Trabaja este día" valor={activo ? "si" : "no"} onCambio={(v) => setActivo(v === "si")} opciones={[{ valor: "si", texto: "Sí" }, { valor: "no", texto: "No" }]} />
      </div>
      {activo && (
        <div className="fila-2">
          <Campo etiqueta="Desde"><input className="campo" type="time" step={900} value={desde} onChange={(e) => setDesde(e.target.value)} /></Campo>
          <Campo etiqueta="Hasta"><input className="campo" type="time" step={900} value={hasta} onChange={(e) => setHasta(e.target.value)} /></Campo>
        </div>
      )}
      <PieHoja>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button className="boton" onClick={async () => setError(await onGuardar({ activo, desde, hasta }))}>Guardar</button>
      </PieHoja>
    </div>
  );
}
