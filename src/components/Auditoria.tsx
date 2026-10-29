"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearHora } from "@/lib/dinero";
import { describirAuditoria } from "@/lib/gestion";
import type { EntradaAuditoria, Membresia } from "@/lib/tipos";

// Historial de cambios importantes. Solo lo ve el dueño y nadie puede editarlo ni borrarlo.
export default function Auditoria({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const [abierto, setAbierto] = useState(false);
  const [filas, setFilas] = useState<EntradaAuditoria[] | null>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    void Promise.resolve(getSupabase().from("audit_log").select("id,user_id,at,action,entity,entity_id,detail").eq("business_id", yo.business_id).order("at", { ascending: false }).limit(100))
      .then(({ data }) => { if (vivo) setFilas((data as EntradaAuditoria[]) ?? []); });
    return () => { vivo = false; };
  }, [abierto, yo.business_id]);

  const quien = (id: string | null) => (id ? equipo.find((m) => m.user_id === id)?.display_name ?? "Alguien del equipo" : "Sistema");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Historial de cambios</h2>
      <button className="text-sm underline self-start" onClick={() => setAbierto((v) => !v)}>{abierto ? "Ocultar" : "Ver los últimos 100 cambios"}</button>
      {abierto && (filas === null ? <p className="texto-suave text-sm">Cargando…</p> : filas.length === 0 ? <p className="texto-suave text-sm">Todavía no hay cambios registrados.</p> : (
        <ul className="flex flex-col gap-2 text-sm">
          {filas.map((f) => (
            <li key={f.id} className="border-b pb-2" style={{ borderColor: "var(--linea)" }}>
              <p>{describirAuditoria(f)}</p>
              <p className="texto-suave text-xs">{formatearHora(f.at)} · {quien(f.user_id)}</p>
            </li>
          ))}
        </ul>
      ))}
    </section>
  );
}
