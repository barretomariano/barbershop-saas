"use client";

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { ACENTOS, acentoPorId, aplicarApariencia, CLAVE_ACENTO, CLAVE_TEMA, guardarLocal, type IdAcento, type Tema } from "@/lib/tema";
import type { Membresia } from "@/lib/tipos";
import { Icono, Segmentado } from "@/components/ui";

interface Props { yo: Membresia; tema: Tema; acento: IdAcento; onTema: (t: Tema) => void; onAcento: (a: IdAcento) => void }

export default function Apariencia({ yo, tema, acento, onTema, onAcento }: Props) {
  const esOwner = yo.role === "OWNER";
  const [msg, setMsg] = useState<string | null>(null);

  function cambiarTema(t: Tema) {
    guardarLocal(CLAVE_TEMA, t);
    aplicarApariencia(t, acento);
    onTema(t);
  }

  async function cambiarAcento(id: IdAcento) {
    if (!esOwner) return;
    setMsg(null);
    const previo = acento;
    guardarLocal(CLAVE_ACENTO, id);
    aplicarApariencia(tema, id);
    onAcento(id);
    const { error } = await getSupabase().from("businesses").update({ accent: id }).eq("id", yo.business_id);
    if (error) {
      // Si todavía no se aplicó la migración 9, el color queda solo en este dispositivo.
      guardarLocal(CLAVE_ACENTO, previo);
      aplicarApariencia(tema, previo);
      onAcento(previo);
      setMsg("No se pudo guardar el color para todo el negocio. Falta aplicar la migración 9 en Supabase.");
    } else setMsg("Listo: tu equipo ve este color la próxima vez que abra la app.");
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="titulo-tarjeta">Tema (solo este dispositivo)</p>
        <Segmentado etiqueta="Tema" valor={tema} onCambio={cambiarTema} opciones={[{ valor: "oscuro", texto: "Oscuro" }, { valor: "claro", texto: "Claro" }]} />
      </div>

      <div className="flex flex-col gap-3">
        <p className="titulo-tarjeta">Color de tu barbería</p>
        <p className="texto-suave text-sm">
          {esOwner ? "Es el color de énfasis de toda la app: botones, íconos y degradados. Lo ve todo tu equipo." : "Este color lo elige el dueño de la barbería."}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ACENTOS.map((a) => {
            const activo = a.id === acento;
            const color = tema === "oscuro" ? a.base : a.fuerte;
            return (
              <button key={a.id} className="opcion items-center" style={{ minHeight: 84, opacity: esOwner || activo ? 1 : 0.5 }} aria-pressed={activo} disabled={!esOwner}
                onClick={() => void cambiarAcento(a.id)}>
                <span className="grid place-items-center rounded-full" style={{ width: 34, height: 34, background: `linear-gradient(140deg, ${color}, ${a.par})`, color: "#fff" }}>
                  {activo && <Icono nombre="check" tam={18} />}
                </span>
                <span className="text-sm font-semibold">{a.nombre}</span>
              </button>
            );
          })}
        </div>
        {msg && <p role="status" className="text-sm font-medium">{msg}</p>}
        <p className="texto-suave text-xs">Elegido: {acentoPorId(acento).nombre}.</p>
      </div>
    </section>
  );
}
