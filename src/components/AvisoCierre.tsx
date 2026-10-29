"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

// Cartel que se ve en cualquier pantalla cuando hay turnos terminados sin cobrar
// (o programados cuya hora ya pasó y nadie cerró). Se actualiza solo cada minuto.
export async function contarPorCerrar(negocio: string): Promise<number> {
  const ahora = new Date().toISOString();
  const { count } = await getSupabase().from("appointments").select("id", { count: "exact", head: true })
    .eq("business_id", negocio)
    .or(`status.eq.DONE,and(status.eq.SCHEDULED,ends_at.lte.${ahora})`);
  return count ?? 0;
}

export default function AvisoCierre({ negocio, onVer }: { negocio: string; onVer: () => void }) {
  const [cantidad, setCantidad] = useState(0);

  useEffect(() => {
    let vivo = true;
    const traer = () => { void contarPorCerrar(negocio).then((n) => { if (vivo) setCantidad(n); }).catch(() => {}); };
    traer();
    const id = window.setInterval(traer, 60_000);
    return () => { vivo = false; window.clearInterval(id); };
  }, [negocio]);

  if (cantidad === 0) return null;
  return (
    <div role="status" className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--acento)" }}>
      <span>{cantidad === 1 ? "Tenés 1 turno por cerrar" : `Tenés ${cantidad} turnos por cerrar`} (cobrar o cancelar).</span>
      <button className="boton-chico" onClick={onVer}>Ver</button>
    </div>
  );
}
