"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { aFilaCobro } from "@/lib/cobros";
import type { FilaCobro, Membresia } from "@/lib/tipos";

// Carga los días de cobro de un rango (un renglón por barbero y día) y el ajuste pendiente de cada barbero.
// El barbero recibe solo lo suyo (lo decide la base); el dueño y el encargado, todo.
export function useCobros(yo: Membresia, desde: string, hasta: string, version = 0) {
  const [filas, setFilas] = useState<FilaCobro[] | null>(null);
  const [ajustes, setAjustes] = useState<Record<string, number>>({});
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const recargar = useCallback(() => setRecarga((n) => n + 1), []);

  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    void Promise.all([
      sb.rpc("dias_cobro", { p_business: yo.business_id, p_desde: desde, p_hasta: hasta }),
      sb.rpc("ajuste_cobros", { p_business: yo.business_id }),
    ]).then(([d, a]) => {
      if (!vivo) return;
      setError(Boolean(d.error));
      setFilas(((d.data as Record<string, unknown>[] | null) ?? []).map(aFilaCobro));
      const mapa: Record<string, number> = {};
      for (const r of ((a.data as { barber_membership_id: string; ajuste: number | string }[] | null) ?? [])) mapa[r.barber_membership_id] = Number(r.ajuste);
      setAjustes(mapa);
    });
    return () => { vivo = false; };
  }, [yo.business_id, desde, hasta, version, recarga]);

  return { filas, ajustes, error, recargar };
}
