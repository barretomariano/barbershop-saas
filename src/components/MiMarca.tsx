"use client";

import { useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { linkBarberia, normalizarSlug, prepararLogo, slugValido, urlLogo } from "@/lib/marca";
import type { Membresia } from "@/lib/tipos";
import { Campo, PieHoja } from "@/components/ui";

interface Props { yo: Membresia; nombre: string; slug: string | null; logoVersion: number; onCambio: () => void }

// Solo el dueño: nombre, dirección y logo de la barbería. De acá sale el link con el que la app se instala con su marca.
export default function MiMarca({ yo, nombre, slug, logoVersion, onCambio }: Props) {
  const [nom, setNom] = useState(nombre);
  const [dir, setDir] = useState(slug ?? normalizarSlug(nombre));
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const origen = typeof window === "undefined" ? "" : window.location.origin;
  const dirOk = slugValido(dir);

  async function guardar() {
    if (!dirOk) { setMsg({ tipo: "error", texto: "La dirección debe tener entre 3 y 30 caracteres: letras minúsculas, números y guiones." }); return; }
    setOcupado(true); setMsg(null);
    const { error } = await getSupabase().rpc("set_branding", { p_business: yo.business_id, p_name: nom, p_slug: dir });
    setOcupado(false);
    if (error) setMsg({ tipo: "error", texto: error.message });
    else { setMsg({ tipo: "ok", texto: "Guardado. Tu equipo ve el nombre nuevo la próxima vez que abra la app." }); onCambio(); }
  }

  async function subir(f: File | undefined) {
    if (!f) return;
    setOcupado(true); setMsg(null);
    try {
      const { p192, p512 } = await prepararLogo(f);
      const sb = getSupabase();
      for (const [tam, blob] of [[512, p512], [192, p192]] as const) {
        const ruta = `${yo.business_id}/logo-${tam}.png`;
        const opciones = { contentType: "image/png", cacheControl: "3600" };
        // Primero reemplazando el logo anterior (upsert). Si Storage lo rechaza, se prueba como logo nuevo:
        // la primera subida no necesita permiso de lectura y funciona aun sin la migración 12.
        let { error } = await sb.storage.from("logos").upload(ruta, blob, { ...opciones, upsert: true });
        if (error) ({ error } = await sb.storage.from("logos").upload(ruta, blob, { ...opciones, upsert: false }));
        if (error) throw new Error(`No se pudo subir el logo: ${error.message}. Si dice "row-level security", aplicá la migración 12 en Supabase.`);
      }
      const { error } = await sb.rpc("set_logo", { p_business: yo.business_id, p_has: true });
      if (error) throw new Error(error.message);
      setMsg({ tipo: "ok", texto: "Logo actualizado." });
      onCambio();
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo subir el logo." });
    } finally {
      setOcupado(false);
      if (archivo.current) archivo.current.value = "";
    }
  }

  async function quitarLogo() {
    setOcupado(true); setMsg(null);
    const sb = getSupabase();
    // Si Storage no deja borrar los archivos, igual se quita el logo de la barbería (queda sin mostrarse).
    await sb.storage.from("logos").remove([`${yo.business_id}/logo-512.png`, `${yo.business_id}/logo-192.png`]);
    const { error } = await sb.rpc("set_logo", { p_business: yo.business_id, p_has: false });
    setOcupado(false);
    if (error) setMsg({ tipo: "error", texto: error.message }); else { setMsg({ tipo: "ok", texto: "Logo quitado." }); onCambio(); }
  }

  const link = slug ? linkBarberia(origen, slug) : null;

  return (
    <section className="flex flex-col gap-5">
      <div className="tarjeta flex items-center gap-4">
        <div className="logo-marco" style={{ width: 84, height: 84 }}>
          {logoVersion > 0
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={urlLogo(base, yo.business_id, logoVersion, 192)} alt={`Logo de ${nombre}`} width={84} height={84} />
            : <span className="titulo text-3xl">{(nombre || "B").slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="texto-suave text-sm">Cuadrado, se recorta al centro. Es el ícono de la app instalada.</p>
          <div className="flex flex-wrap gap-2">
            <button className="boton-chico" disabled={ocupado} onClick={() => archivo.current?.click()}>{logoVersion > 0 ? "Cambiar logo" : "Subir logo"}</button>
            {logoVersion > 0 && <button className="chip" disabled={ocupado} onClick={() => void quitarLogo()}>Quitar</button>}
          </div>
          <input ref={archivo} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => void subir(e.target.files?.[0])} />
        </div>
      </div>

      <div className="formulario">
        <Campo etiqueta="Nombre de la barbería" ayuda="Es el nombre que aparece en la app y debajo del ícono al instalarla.">
          <input className="campo" maxLength={80} value={nom} onChange={(e) => setNom(e.target.value)} />
        </Campo>
        <Campo etiqueta="Dirección del link" ayuda={dirOk ? `Tu link: ${linkBarberia(origen || "https://tu-sitio", dir)}` : "Minúsculas, números y guiones (3 a 30 caracteres)."}>
          <input className="campo" autoCapitalize="none" spellCheck={false} maxLength={30} value={dir} onChange={(e) => setDir(e.target.value.toLowerCase())} onBlur={() => setDir(normalizarSlug(dir))} />
        </Campo>
        <PieHoja>
          {msg && <p role={msg.tipo === "error" ? "alert" : "status"} className={`text-sm ${msg.tipo === "error" ? "text-red-600" : ""}`}>{msg.texto}</p>}
          <button className="boton" disabled={ocupado} onClick={() => void guardar()}>{ocupado ? "Guardando…" : "Guardar"}</button>
        </PieHoja>
      </div>

      {link && (
        <div className="tarjeta flex flex-col gap-3">
          <p className="titulo-tarjeta">Link de tu barbería</p>
          <p className="break-all font-semibold">{link}</p>
          <p className="texto-suave text-sm">Compartilo con tu equipo y tus clientes. Al abrirlo en el celular, “Agregar a pantalla de inicio” instala la app con tu nombre y tu logo.</p>
          <div className="flex gap-2">
            <button className="boton-chico" onClick={async () => { await navigator.clipboard?.writeText(link); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }}>{copiado ? "¡Copiado!" : "Copiar link"}</button>
            <a className="chip" href={link} target="_blank" rel="noreferrer">Abrir</a>
          </div>
        </div>
      )}
    </section>
  );
}
