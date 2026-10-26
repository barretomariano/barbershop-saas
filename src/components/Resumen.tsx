"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import { rangoPeriodo, type Periodo } from "@/lib/periodos";
import type { Membresia, Venta } from "@/lib/tipos";

interface Props { yo: Membresia; equipo: Membresia[] }

export default function Resumen({ yo, equipo }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const puedeAnular = yo.role !== "BARBER";

  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    void pedirVentas(periodo).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) setError("No se pudieron cargar las ventas.");
      else { setError(null); setVentas(data); }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [periodo, version]);

  const validas = ventas.filter((v) => v.status === "VALID");
  const total = validas.reduce((s, v) => s + v.amount, 0);
  const paraBarbero = validas.reduce((s, v) => s + v.barber_amount, 0);
  const paraLocal = validas.reduce((s, v) => s + v.local_amount, 0);
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  async function anular(id: string) {
    const motivo = window.prompt("Motivo de la anulación:");
    if (!motivo) return;
    const { error: e } = await getSupabase().rpc("cancel_sale", { p_sale: id, p_reason: motivo });
    if (e) setError(e.message); else recargar();
  }

  const porBarbero = equipo
    .filter((m) => m.role === "BARBER")
    .map((m) => {
      const v = validas.filter((x) => x.barber_membership_id === m.id);
      return { m, cantidad: v.length, vendido: v.reduce((s, x) => s + x.amount, 0), gana: v.reduce((s, x) => s + x.barber_amount, 0) };
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
                  <li key={m.id} className="flex justify-between border-b pb-2" style={{ borderColor: "var(--linea)" }}>
                    <span>{m.display_name} · {cantidad} {cantidad === 1 ? "venta" : "ventas"}</span>
                    <span>{formatearARS(vendido)} (gana {formatearARS(gana)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h2 className="mb-2 font-medium">Ventas</h2>
            {ventas.length === 0 ? <p className="texto-suave text-sm">No hay ventas en este período.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {ventas.map((v) => (
                  <li key={v.id} className="flex items-start justify-between gap-3 border-b pb-2" style={{ borderColor: "var(--linea)" }}>
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

async function pedirVentas(periodo: Periodo): Promise<{ data: Venta[]; error: boolean }> {
  const { desde, hasta } = rangoPeriodo(periodo);
  const { data, error } = await getSupabase()
    .from("sales")
    .select("id,barber_membership_id,service_name,amount,payment_method,sold_at,commission_model,commission_bps,barber_amount,local_amount,status,cancel_reason")
    .gte("sold_at", desde).lt("sold_at", hasta)
    .order("sold_at", { ascending: false }).limit(500);
  return { data: (data as Venta[]) ?? [], error: Boolean(error) };
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--linea)" }}>
      <p className="texto-suave text-sm">{titulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </div>
  );
}
