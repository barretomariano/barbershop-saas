"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getSupabase } from "@/lib/supabase";
import { normalizarUsuario } from "@/lib/usuario";
import { porcentajeABps } from "@/lib/validacion";
import type { ModeloComision, Rol } from "@/lib/tipos";

interface Props { negocio: string; onCambio: () => void }
interface Miembro { id: string; role: Rol; display_name: string; username: string | null; active: boolean }
interface Credencial { nombre: string; usuario: string; clave: string; motivo: "alta" | "clave" }
type Accion = "restablecer" | "desactivar" | "reactivar";
type Respuesta = { ok: true; datos: Record<string, unknown> } | { ok: false; mensaje: string };

const ROLES: Record<Rol, string> = { OWNER: "Dueño", MANAGER: "Encargado", BARBER: "Barbero" };
const MODELOS: { valor: ModeloComision; etiqueta: string }[] = [
  { valor: "PERCENT", etiqueta: "Porcentaje de cada venta" },
  { valor: "CHAIR_RENT", etiqueta: "Alquiler de silla (se queda con todo)" },
  { valor: "SALARY", etiqueta: "Sueldo fijo (0% por venta)" },
];

// Llama a la función segura del servidor y traduce los errores a mensajes claros.
async function llamar(body: Record<string, unknown>): Promise<Respuesta> {
  const { data, error } = await getSupabase().functions.invoke("gestionar-equipo", { body });
  if (error) {
    let mensaje = "No se pudo completar la acción. Revisá tu conexión e intentá de nuevo.";
    const respuesta = (error as { context?: Response }).context;
    if (respuesta && typeof respuesta.json === "function") {
      if (respuesta.status === 404) mensaje = "La función del servidor todavía no está instalada en Supabase.";
      try {
        const cuerpo = (await respuesta.json()) as { error?: string };
        if (cuerpo?.error) mensaje = cuerpo.error;
      } catch { /* se queda el mensaje general */ }
    }
    return { ok: false, mensaje };
  }
  return { ok: true, datos: (data ?? {}) as Record<string, unknown> };
}

export default function Equipo({ negocio, onCambio }: Props) {
  const [miembros, setMiembros] = useState<Miembro[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [pendiente, setPendiente] = useState<{ id: string; accion: Accion } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nombre, setNombre] = useState("");
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState<"BARBER" | "MANAGER">("BARBER");
  const [clave, setClave] = useState("");
  const [modelo, setModelo] = useState<ModeloComision>("PERCENT");
  const [pct, setPct] = useState("40");

  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(
      getSupabase().from("memberships").select("id,role,display_name,username,active")
        .eq("business_id", negocio).order("created_at"),
    ).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError("No se pudo cargar el equipo.");
      else { setError(null); setMiembros((data as Miembro[]) ?? []); }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [negocio, version]);

  async function agregar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setError(null);
    const u = normalizarUsuario(usuario);
    if (!nombre.trim()) { setError("Escribí el nombre de la persona."); return; }
    if (!u) { setError("El usuario debe tener entre 3 y 30 caracteres: letras minúsculas, números, punto, guion o guion bajo."); return; }
    if (clave !== "" && clave.length < 8) { setError("La clave debe tener al menos 8 caracteres (o dejala vacía para que se genere sola)."); return; }

    let comision: { modelo: ModeloComision; bps: number } | undefined;
    if (rol === "BARBER") {
      const bps = modelo === "PERCENT" ? porcentajeABps(pct) : 0;
      if (bps === null) { setError("El porcentaje debe ser un número entero entre 0 y 100."); return; }
      comision = { modelo, bps };
    }

    setOcupado(true);
    const r = await llamar({ accion: "crear", business_id: negocio, display_name: nombre.trim(), usuario: u, rol, clave: clave || undefined, comision });
    setOcupado(false);
    if (!r.ok) { setError(r.mensaje); return; }
    setCredencial({ nombre: nombre.trim(), usuario: String(r.datos.usuario), clave: String(r.datos.clave), motivo: "alta" });
    setNombre(""); setUsuario(""); setClave("");
    recargar(); onCambio();
  }

  async function ejecutar(m: Miembro, accion: Accion) {
    setOcupado(true);
    setError(null);
    const r = await llamar({ accion, business_id: negocio, membership_id: m.id });
    setOcupado(false);
    setPendiente(null);
    if (!r.ok) { setError(r.mensaje); return; }
    if (accion === "restablecer") setCredencial({ nombre: m.display_name, usuario: String(r.datos.usuario), clave: String(r.datos.clave), motivo: "clave" });
    recargar(); onCambio();
  }

  return (
    <section className="flex flex-col gap-4">

      {credencial && (
        <div role="status" className="flex flex-col gap-2 tarjeta">
          <p className="font-medium">{credencial.motivo === "alta" ? `Listo: ${credencial.nombre} ya puede ingresar` : `Nueva clave de ${credencial.nombre}`}</p>
          <p className="text-sm">Usuario: <strong>{credencial.usuario}</strong></p>
          <p className="text-sm">Clave: <strong>{credencial.clave}</strong></p>
          <p className="texto-suave text-xs">Anotala o pasásela ahora: por seguridad no se puede volver a ver. Si se pierde, generás una nueva.</p>
          <div className="flex gap-3">
            <button className="boton-chico" onClick={() => void navigator.clipboard?.writeText(`Usuario: ${credencial.usuario}\nClave: ${credencial.clave}`)}>Copiar</button>
            <button className="text-sm underline" onClick={() => setCredencial(null)}>Ya la anoté</button>
          </div>
        </div>
      )}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {cargando ? <p className="texto-suave text-sm">Cargando…</p> : (
        <ul className="flex flex-col gap-2 text-sm">
          {miembros.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 border-b pb-2">
              <div className={`flex justify-between gap-3 ${m.active ? "" : "opacity-60"}`}>
                <span>{m.display_name} · {ROLES[m.role]}{!m.active && " · desactivado"}</span>
                <span className="texto-suave">{m.username ?? ""}</span>
              </div>
              {m.role !== "OWNER" && (
                pendiente?.id === m.id ? (
                  <div className="flex items-center gap-3 text-xs">
                    <span>{pendiente.accion === "restablecer" ? "¿Generar una clave nueva? La anterior deja de servir." : pendiente.accion === "desactivar" ? "¿Desactivar? Pierde el acceso ya mismo; su historial se conserva." : "¿Reactivar el acceso?"}</span>
                    <button className="boton-chico" disabled={ocupado} onClick={() => void ejecutar(m, pendiente.accion)}>Confirmar</button>
                    <button className="underline" onClick={() => setPendiente(null)}>Cancelar</button>
                  </div>
                ) : (
                  <div className="flex gap-4 text-xs">
                    {m.active && m.username && <button className="underline" onClick={() => setPendiente({ id: m.id, accion: "restablecer" })}>Nueva clave</button>}
                    {m.active
                      ? <button className="underline" onClick={() => setPendiente({ id: m.id, accion: "desactivar" })}>Desactivar</button>
                      : <button className="underline" onClick={() => setPendiente({ id: m.id, accion: "reactivar" })}>Reactivar</button>}
                  </div>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={agregar} className="flex flex-col gap-2 tarjeta">
        <h3 className="font-medium">Agregar una persona</h3>
        <input className="campo" placeholder="Nombre (ej. Juan Pérez)" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="campo" placeholder="Usuario para ingresar (ej. juan.perez)" autoCapitalize="none" spellCheck={false} maxLength={30} value={usuario} onChange={(e) => setUsuario(e.target.value)} />
        <select className="campo" value={rol} onChange={(e) => setRol(e.target.value as "BARBER" | "MANAGER")}>
          <option value="BARBER">Barbero</option>
          <option value="MANAGER">Encargado</option>
        </select>
        <input className="campo" placeholder="Clave (vacía = se genera sola)" autoCapitalize="none" spellCheck={false} maxLength={72} value={clave} onChange={(e) => setClave(e.target.value)} />
        {rol === "BARBER" && (
          <>
            <select className="campo" value={modelo} onChange={(e) => setModelo(e.target.value as ModeloComision)}>
              {MODELOS.map((x) => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
            </select>
            {modelo === "PERCENT" && (
              <label className="flex items-center gap-2 text-sm">
                Porcentaje para el barbero
                <input className="campo w-24" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} /> %
              </label>
            )}
          </>
        )}
        <button type="submit" className="boton" disabled={ocupado}>{ocupado ? "Guardando…" : "Agregar"}</button>
      </form>
    </section>
  );
}
