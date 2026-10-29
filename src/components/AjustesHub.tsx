"use client";

import type { ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import type { DatosNegocio, Membresia } from "@/lib/tipos";
import { subAjustesDisponibles, type SubAjustes } from "@/lib/navegacion";
import type { IdAcento, Tema } from "@/lib/tema";
import { Icono, Volver, type NombreIcono } from "@/components/ui";
import { Comisiones, Servicios } from "@/components/Ajustes";
import { Horarios, Metas, Modulos } from "@/components/AjustesNegocio";
import Auditoria from "@/components/Auditoria";
import Equipo from "@/components/Equipo";
import Clientes from "@/components/Clientes";
import Apariencia from "@/components/Apariencia";

interface Props {
  yo: Membresia; equipo: Membresia[]; negocio: DatosNegocio; sub: SubAjustes | null; onSub: (s: SubAjustes | null) => void; onCambio: () => void;
  tema: Tema; acento: IdAcento; onTema: (t: Tema) => void; onAcento: (a: IdAcento) => void;
}

const FICHA: Record<SubAjustes, { titulo: string; detalle: string; icono: NombreIcono }> = {
  clientes: { titulo: "Clientes", detalle: "Fichas, teléfonos e historial", icono: "clientes" },
  servicios: { titulo: "Servicios y precios", detalle: "Lo que ofrecés y cuánto cuesta", icono: "servicios" },
  equipo: { titulo: "Equipo", detalle: "Barberos, encargados y accesos", icono: "equipo" },
  comisiones: { titulo: "Comisiones", detalle: "Cuánto gana cada barbero", icono: "comisiones" },
  horarios: { titulo: "Horarios de trabajo", detalle: "Días y horas de la agenda", icono: "horarios" },
  metas: { titulo: "Metas del mes", detalle: "Objetivos de ventas", icono: "metas" },
  modulos: { titulo: "Módulos", detalle: "Encender o apagar Agenda y Clientes", icono: "modulos" },
  apariencia: { titulo: "Apariencia", detalle: "Tema y color de tu barbería", icono: "apariencia" },
  historial: { titulo: "Historial de cambios", detalle: "Quién cambió qué y cuándo", icono: "historial" },
};

const GRUPOS: { titulo: string; items: SubAjustes[] }[] = [
  { titulo: "Tu barbería", items: ["clientes", "servicios", "equipo", "comisiones", "horarios", "metas"] },
  { titulo: "App", items: ["modulos", "apariencia", "historial"] },
];

export default function AjustesHub({ yo, equipo, negocio, sub, onSub, onCambio, tema, acento, onTema, onAcento }: Props) {
  const disponibles = subAjustesDisponibles(yo.role, negocio.modulos);
  const abierta = sub && disponibles.includes(sub) ? sub : null;
  const hayAgenda = negocio.modulos.includes("AGENDA");

  if (abierta) {
    const f = FICHA[abierta];
    let contenido: ReactNode = null;
    if (abierta === "clientes") contenido = <Clientes yo={yo} />;
    if (abierta === "servicios") contenido = <Servicios yo={yo} hayAgenda={hayAgenda} />;
    if (abierta === "equipo") contenido = <Equipo negocio={yo.business_id} onCambio={onCambio} />;
    if (abierta === "comisiones") contenido = <Comisiones equipo={equipo} onCambio={onCambio} />;
    if (abierta === "horarios") contenido = <Horarios yo={yo} equipo={equipo} />;
    if (abierta === "metas") contenido = <Metas yo={yo} equipo={equipo} />;
    if (abierta === "modulos") contenido = <Modulos yo={yo} negocio={negocio} onCambio={onCambio} />;
    if (abierta === "historial") contenido = <Auditoria yo={yo} equipo={equipo} />;
    if (abierta === "apariencia") contenido = <Apariencia yo={yo} tema={tema} acento={acento} onTema={onTema} onAcento={onAcento} />;
    return (
      <div className="flex flex-col gap-5">
        <Volver texto="Ajustes" onClick={() => onSub(null)} />
        <div>
          <h2 className="titulo text-2xl font-semibold">{f.titulo}</h2>
          <p className="texto-suave text-sm">{f.detalle}</p>
        </div>
        {contenido}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GRUPOS.map((g) => {
        const items = g.items.filter((i) => disponibles.includes(i));
        if (items.length === 0) return null;
        return (
          <div key={g.titulo} className="flex flex-col gap-2">
            <p className="titulo-tarjeta px-2">{g.titulo}</p>
            <div className="grupo-ajustes">
              {items.map((i) => (
                <button key={i} className="fila-ajuste" onClick={() => onSub(i)}>
                  <span className="icono-caja"><Icono nombre={FICHA[i].icono} tam={20} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold">{FICHA[i].titulo}</span>
                    <span className="texto-suave truncate text-sm">{FICHA[i].detalle}</span>
                  </span>
                  <Icono nombre="siguiente" tam={18} className="texto-suave" />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {yo.role === "BARBER" && <p className="texto-suave px-2 text-sm">Tus comisiones y los permisos los configura el dueño.</p>}
      <div className="grupo-ajustes">
        <button className="fila-ajuste" onClick={() => getSupabase().auth.signOut()}>
          <span className="icono-caja" style={{ color: "var(--peligro)" }}><Icono nombre="salir" tam={20} /></span>
          <span className="font-semibold">Cerrar sesión</span>
        </button>
      </div>
    </div>
  );
}
