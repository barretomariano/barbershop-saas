"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import { rangoPeriodo, type Periodo } from "@/lib/periodos";
import type { FilaResumenVentas, Membresia, Venta } from "@/lib/tipos";

const MAX_LISTA = 100;

interface Props { yo: Membresia; equipo: Membresia[] }

export default function Resumen({ yo, equipo }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [filas, setFilas] = useState<FilaResumenVentas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const puedeAnular = yo.role !== "BARBER";

  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void pedirDatos(periodo, yo.business_id).then(({ ventas: v, filas: f, error: e }) => {
      if (!vivo) return;
      if (e) setError("No se pudieron cargar las ventas.");
      else { setError(null); setVentas(v); setFilas(f); }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [periodo, version, yo.business_id]);

  // Los totales los calcula la base de datos sobre TODAS las ventas válidas del período.
  const total = filas.reduce((s, f) => s + f.vendido, 0);
  const paraBarbero = filas.reduce((s, f) => s + f.para_barbero, 0);
  const paraLocal = filas.reduce((s, f) => s + f.para_local, 0);
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  async function anular(id: string) {
    const motivo = window.prompt("Motivo de la anulación:");
    if (!motivo) return;
    const { error: e } = await getSupabase().rpc("cancel_sale", { p_sale: id, p_reason: motivo });
    if (e) setError(e.message); else recargar();
  }

  const porBarbero = equipo
    .map((m) => {
      const f = filas.filter((x) => x.barber_membership_id === m.id);
      return { m, cantidad: f.reduce((s, x) => s + x.cantidad, 0), vendido: f.reduce((s, x) => s + x.vendido, 0), gana: f.reduce((s, x) => s + x.para_barbero, 0) };
    })
    .filter((x) => x.cantidad > 0);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex gap-2">
        {(["hoy", "semana", "mes"] as Periodo[]).map((p) => (
          <button key={p} onClick={() => { setCargando(true); setPeriodo(p); }}
            className={`chip ${periodo === p ? "chip-activo" : ""}`}>
            {p === "hoy" ? "Hoy" : p === "semana" ? "Últimos 7 días" : "Este mes"}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {cargando ? <p className="texto-suave">Cargando…</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Dato titulo="Vendido" valor={formatearARS(total)} />
            <Dato titulo={yo.role === "BARBER" ? "Tu ganancia" : "Para barberos"} valor={formatearARS(paraBarbero)} />
            {yo.role !== "BARBER" && <Dato titulo="Para el local" valor={formatearARS(paraLocal)} />}
          </div>

          {yo.role !== "BARBER" && porBarbero.length > 0 && (
            <div>
              <h2 className="mb-2 font-medium">Por barbero</h2>
              <ul className="flex flex-col gap-2 text-sm">
                {porBarbero.map(({ m, cantidad, vendido, gana }) => (
                  <li key={m.id} className="flex justify-between border-b pb-2">
                    <span>{m.display_name} · {cantidad} {cantidad === 1 ? "venta" : "ventas"}</span>
                    <span>{formatearARS(vendido)} (gana {formatearARS(gana)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-medium">Ventas</h2>
            {ventas.length >= MAX_LISTA && (
              <p className="texto-suave mb-2 text-xs">Se muestran las últimas {MAX_LISTA} ventas. Los totales de arriba incluyen todas.</p>
            )}
            {ventas.length === 0 ? <p className="texto-suave text-sm">No hay ventas en este período.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {ventas.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 border-b pb-2">
                    <div className={v.status === "CANCELED" ? "line-through opacity-60" : ""}>
                      <p>{formatearARS(v.amount)} · {v.service_name ?? "Sin servicio"}</p>
                      <p className="texto-suave">{formatearHora(v.sold_at)} · {nombre(v.barber_membership_id)} · {v.payment_method}</p>
                      {v.status === "CANCELED" && <p className="text-xs">Anulada: {v.cancel_reason}</p>}
                    </div>
                    {puedeAnular && v.status === "VALID" && (
                      <button className="text-xs underline" onClick={() => anular(v.id)}>Anular</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}

async function pedirDatos(periodo: Periodo, negocio: string): Promise<{ ventas: Venta[]; filas: FilaResumenVentas[]; error: boolean }> {
  const { desde, hasta } = rangoPeriodo(periodo);
  const sb = getSupabase();
  const [lista, resumen] = await Promise.all([
    sb.from("sales")
      .select("id,barber_membership_id,service_name,amount,payment_method,sold_at,commission_model,commission_bps,barber_amount,local_amount,status,cancel_reason")
      .eq("business_id", negocio)
      .gte("sold_at", desde).lt("sold_at", hasta)
      .order("sold_at", { ascending: false }).limit(MAX_LISTA),
    sb.rpc("resumen_ventas", { p_business: negocio, p_desde: desde, p_hasta: hasta }),
  ]);
  return {
    ventas: (lista.data as Venta[]) ?? [],
    filas: (resumen.data as FilaResumenVentas[]) ?? [],
    error: Boolean(lista.error || resumen.error),
  };
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="tarjeta">
      <p className="texto-suave text-sm">{titulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </div>
  );
}
