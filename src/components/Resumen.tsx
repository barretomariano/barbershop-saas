"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import { rangoPeriodo, type Periodo } from "@/lib/periodos";
import { MEDIOS_PAGO, type FilaResumenVentas, type Membresia, type Venta } from "@/lib/tipos";
import { Segmentado } from "@/components/ui";

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
    <section className="flex flex-col gap-4">
      <Segmentado etiqueta="Período" valor={periodo} onCambio={(p) => { setCargando(true); setPeriodo(p); }}
        opciones={[{ valor: "hoy", texto: "Hoy" }, { valor: "semana", texto: "Esta semana" }, { valor: "mes", texto: "Mes" }, { valor: "anio", texto: "Año" }]} />

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {cargando ? <p className="texto-suave">Cargando…</p> : (
        <>
          <div className="tarjeta tarjeta-principal flex flex-col gap-3">
            <div>
              <p className="texto-suave text-sm font-semibold">Vendido</p>
              <p className="monto text-[40px] leading-none">{formatearARS(total)}</p>
            </div>
            <div className="flex gap-6">
              <div><p className="texto-suave text-xs">{yo.role === "BARBER" ? "Tu ganancia" : "Para barberos"}</p><p className="monto text-xl">{formatearARS(paraBarbero)}</p></div>
              {yo.role !== "BARBER" && <div><p className="texto-suave text-xs">Para el local</p><p className="monto text-xl">{formatearARS(paraLocal)}</p></div>}
            </div>
          </div>

          {yo.role !== "BARBER" && porBarbero.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="titulo-tarjeta px-2">Por barbero</p>
              <ul className="grupo-ajustes">
                {porBarbero.map(({ m, cantidad, vendido, gana }) => (
                  <li key={m.id} className="fila-ajuste" style={{ cursor: "default" }}>
                    <span className="avatar" style={{ width: 38, height: 38, fontSize: 15 }}>{m.display_name.slice(0, 1).toUpperCase()}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold">{m.display_name}</span>
                      <span className="texto-suave text-xs">{cantidad} {cantidad === 1 ? "venta" : "ventas"} · gana {formatearARS(gana)}</span>
                    </span>
                    <span className="monto text-lg">{formatearARS(vendido)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <p className="titulo-tarjeta px-2">Ventas</p>
            {ventas.length >= MAX_LISTA && (
              <p className="texto-suave px-2 text-xs">Se muestran las últimas {MAX_LISTA} ventas. Los totales de arriba incluyen todas.</p>
            )}
            {ventas.length === 0 ? <p className="texto-suave px-2 text-sm">No hay ventas en este período.</p> : (
              <ul className="grupo-ajustes">
                {ventas.map((v) => (
                  <li key={v.id} className="fila-ajuste" style={{ cursor: "default", alignItems: "flex-start" }}>
                    <span className="flex min-w-0 flex-1 flex-col" style={v.status === "CANCELED" ? { textDecoration: "line-through", opacity: 0.55 } : undefined}>
                      <span className="truncate font-semibold">{v.service_name ?? "Sin servicio"}</span>
                      <span className="texto-suave text-xs">{formatearHora(v.sold_at)} · {nombre(v.barber_membership_id)} · {MEDIOS_PAGO.find((x) => x.valor === v.payment_method)?.etiqueta ?? v.payment_method}</span>
                      {v.status === "CANCELED" && <span className="text-xs">Anulada: {v.cancel_reason}</span>}
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="monto text-lg">{formatearARS(v.amount)}</span>
                      {puedeAnular && v.status === "VALID" && <button className="text-xs underline texto-suave" onClick={() => anular(v.id)}>Anular</button>}
                    </span>
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
