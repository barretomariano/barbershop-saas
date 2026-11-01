"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { CLAVE_MARCA, CLAVE_TEMA, guardarLocal, marcasIguales, serializarMarca, type Marca, type PrefTema } from "@/lib/tema";
import type { Membresia } from "@/lib/tipos";
import { Segmentado } from "@/components/ui";
import SelectorColores from "@/components/SelectorColores";

interface Props { yo: Membresia; pref: PrefTema; marca: Marca; onPref: (t: PrefTema) => void; onMarca: (m: Marca) => void }

export default function Apariencia({ yo, pref, marca, onPref, onMarca }: Props) {
  const esOwner = yo.role === "OWNER";
  // `marca` (la que llega de afuera) cambia mientras se elige, porque la vista previa se aplica a toda la app.
  // Por eso lo realmente guardado se recuerda aparte: contra eso se decide si hay algo para guardar.
  const [guardada, setGuardada] = useState<Marca>(marca);
  const [borrador, setBorrador] = useState<Marca>(marca);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const cambiado = !marcasIguales(borrador, guardada);

  // Al salir de la pantalla sin guardar, la app vuelve a los colores guardados.
  const guardadaRef = useRef(guardada);
  const onMarcaRef = useRef(onMarca);
  useEffect(() => { guardadaRef.current = guardada; onMarcaRef.current = onMarca; });
  useEffect(() => () => onMarcaRef.current(guardadaRef.current), []);

  function cambiarPref(t: PrefTema) {
    guardarLocal(CLAVE_TEMA, t);
    onPref(t);
  }

  // La vista previa se aplica a toda la app mientras se elige; "Guardar" lo deja para todo el equipo.
  function elegir(m: Marca) { setBorrador(m); setMsg(null); onMarca(m); }

  async function guardar() {
    setGuardando(true); setMsg(null);
    const { error } = await getSupabase().from("businesses").update({ primary_color: borrador.principal, secondary_color: borrador.secundario }).eq("id", yo.business_id);
    setGuardando(false);
    if (error) {
      setMsg({ tipo: "error", texto: "No se pudieron guardar los colores. Revisá tu conexión y probá de nuevo; tus colores elegidos siguen acá." });
    } else {
      guardarLocal(CLAVE_MARCA, serializarMarca(borrador));
      setGuardada(borrador);
      setMsg({ tipo: "ok", texto: "Listo: tu equipo ve estos colores la próxima vez que abra la app." });
    }
  }

  return (
    <section className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <p className="titulo-tarjeta">Tema (solo este dispositivo)</p>
        <Segmentado etiqueta="Tema" valor={pref} onCambio={cambiarPref}
          opciones={[{ valor: "auto", texto: "Automático" }, { valor: "claro", texto: "Claro" }, { valor: "oscuro", texto: "Oscuro" }]} />
        <p className="texto-suave text-xs">Automático sigue el modo claro u oscuro de tu celular. El oscuro es negro puro (AMOLED).</p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="titulo-tarjeta">Colores de tu barbería</p>
        <p className="texto-suave text-sm">
          {esOwner ? "Elegí un color principal y uno secundario: dan identidad a la app y a tu logo. Los ve todo tu equipo." : "Estos colores los elige el dueño de la barbería."}
        </p>
        <SelectorColores marca={borrador} onCambio={elegir} deshabilitado={!esOwner || guardando} />
        {esOwner && (
          <div className="flex flex-col gap-2">
            {msg && <p role={msg.tipo === "error" ? "alert" : "status"} className={`text-sm font-medium ${msg.tipo === "error" ? "text-red-600" : ""}`}>{msg.texto}</p>}
            <div className="flex gap-2">
              <button className="boton flex-1" disabled={!cambiado || guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar colores"}</button>
              {cambiado && <button className="boton-fantasma" disabled={guardando} onClick={() => elegir(guardada)}>Descartar</button>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
