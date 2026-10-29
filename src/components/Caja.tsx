"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import { hoyAR } from "@/lib/periodos";
import { parsearMonto } from "@/lib/validacion";
import { rangoDia, sumarDias } from "@/lib/turnos";
import { MEDIOS_PAGO, type CierreCaja, type FilaPendiente, type FilaResumenGastos, type FilaResumenVentas, type Liquidacion, type Membresia } from "@/lib/tipos";

export default function Caja({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <div className="flex flex-col gap-8">
      <CierreDia yo={yo} version={version} onCambio={recargar} />
      <Liquidaciones yo={yo} equipo={equipo} version={version} onCambio={recargar} />
    </div>
  );
}

function CierreDia({ yo, version, onCambio }: { yo: Membresia; version: number; onCambio: () => void }) {
  const [fecha, setFecha] = useState(hoyAR());
  const [ventas, setVentas] = useState<FilaResumenVentas[]>([]);
  const [gastos, setGastos] = useState<FilaResumenGastos[]>([]);
  const [cierres, setCierres] = useState<CierreCaja[]>([]);
  const [contado, setContado] = useState("");
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const rango = rangoDia(fecha);
    const sb = getSupabase();
    void Promise.all([
      rango ? sb.rpc("resumen_ventas", { p_business: yo.business_id, p_desde: rango.desde, p_hasta: rango.hasta }) : Promise.resolve({ data: [] }),
      rango ? sb.rpc("resumen_gastos", { p_business: yo.business_id, p_desde: rango.desde, p_hasta: rango.hasta }) : Promise.resolve({ data: [] }),
      sb.from("cash_closings").select("id,closing_date,expected_cash,counted_cash,difference,sales_count,sales_total,expenses_total,by_method,note")
        .eq("business_id", yo.business_id).order("closing_date", { ascending: false }).limit(14),
    ]).then(([v, g, c]) => {
      if (!vivo) return;
      setVentas((v.data as FilaResumenVentas[]) ?? []);
      setGastos((g.data as FilaResumenGastos[]) ?? []);
      setCierres((c.data as CierreCaja[]) ?? []);
    });
    return () => { vivo = false; };
  }, [yo.business_id, fecha, version]);

  const cerrado = cierres.find((c) => c.closing_date === fecha);
  const efectivo = ventas.filter((v) => v.payment_method === "EFECTIVO").reduce((s, v) => s + v.vendido, 0);
  const total = ventas.reduce((s, v) => s + v.vendido, 0);
  const cant = ventas.reduce((s, v) => s + v.cantidad, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.total, 0);
  const contadoNum = contado.trim() === "" ? null : contado.trim() === "0" ? 0 : parsearMonto(contado);

  async function cerrar() {
    if (contadoNum === null) { setMsg("Escribí el efectivo que contaste (puede ser 0)."); return; }
    setEnviando(true);
    setMsg(null);
    const { error } = await getSupabase().rpc("close_day", { p_business: yo.business_id, p_date: fecha, p_counted: contadoNum, p_note: nota || null });
    setEnviando(false);
    if (error) setMsg(error.message); else { setContado(""); setNota(""); onCambio(); }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Cierre de caja</h2>
      <div className="flex items-center justify-between gap-2">
        <button className="chip" aria-label="Día anterior" onClick={() => setFecha(sumarDias(fecha, -1))}>←</button>
        <input className="campo w-44" type="date" value={fecha} max={hoyAR()} onChange={(e) => e.target.value && setFecha(e.target.value)} aria-label="Día a cerrar" />
        <button className="chip" aria-label="Día siguiente" disabled={fecha >= hoyAR()} onClick={() => setFecha(sumarDias(fecha, 1))}>→</button>
      </div>

      {cerrado ? (
        <div className="tarjeta text-sm" style={{ borderColor: "var(--acento)" }}>
          <p className="font-medium">Caja cerrada</p>
          <p>Esperado en efectivo: {formatearARS(cerrado.expected_cash)}</p>
          <p>Contado: {formatearARS(cerrado.counted_cash)}</p>
          <p className={cerrado.difference === 0 ? "" : "text-red-600"}>
            {cerrado.difference === 0 ? "Sin diferencia." : cerrado.difference > 0 ? `Sobran ${formatearARS(cerrado.difference)}.` : `Faltan ${formatearARS(-cerrado.difference)}.`}
          </p>
          {cerrado.note && <p className="texto-suave">{cerrado.note}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 tarjeta">
          <p className="text-sm">{cant} ventas · {formatearARS(total)} · gastos del día {formatearARS(totalGastos)}</p>
          <ul className="texto-suave text-sm">
            {MEDIOS_PAGO.map((m) => ({ ...m, t: ventas.filter((v) => v.payment_method === m.valor).reduce((s, v) => s + v.vendido, 0) })).filter((m) => m.t > 0)
              .map((m) => <li key={m.valor}>{m.etiqueta}: {formatearARS(m.t)}</li>)}
          </ul>
          <p className="font-medium">Efectivo que debería haber: {formatearARS(efectivo)}</p>
          <label className="flex flex-col gap-1 text-sm">Efectivo que contaste
            <input className="campo" inputMode="numeric" placeholder="$ 0" value={contado} onChange={(e) => setContado(e.target.value)} />
          </label>
          {contadoNum !== null && <p className="texto-suave text-sm">Diferencia: {formatearARS(contadoNum - efectivo)}</p>}
          <input className="campo" placeholder="Nota (opcional)" maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} />
          {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
          <button className="boton" onClick={cerrar} disabled={enviando}>{enviando ? "Cerrando…" : "Cerrar caja del día"}</button>
          <p className="texto-suave text-xs">Un día cerrado no se puede modificar.</p>
        </div>
      )}

      {cierres.length > 0 && (
        <details>
          <summary className="texto-suave cursor-pointer text-sm">Últimos cierres</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {cierres.map((c) => (
              <li key={c.id} className="flex justify-between">
                <span>{c.closing_date.split("-").reverse().join("/")} · {formatearARS(c.sales_total)}</span>
                <span className={c.difference === 0 ? "texto-suave" : "text-red-600"}>{c.difference === 0 ? "Sin diferencia" : `${c.difference > 0 ? "+" : ""}${formatearARS(c.difference)}`}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function Liquidaciones({ yo, equipo, version, onCambio }: { yo: Membresia; equipo: Membresia[]; version: number; onCambio: () => void }) {
  const [hasta, setHasta] = useState(hoyAR());
  const [pendiente, setPendiente] = useState<FilaPendiente[]>([]);
  const [hechas, setHechas] = useState<Liquidacion[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "—";

  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    void Promise.all([
      sb.rpc("pendiente_liquidacion", { p_business: yo.business_id, p_upto: hasta }),
      sb.from("settlements").select("id,barber_membership_id,upto,sales_count,sales_total,amount,note,created_at").eq("business_id", yo.business_id).order("created_at", { ascending: false }).limit(10),
    ]).then(([p, h]) => {
      if (!vivo) return;
      setPendiente((p.data as FilaPendiente[]) ?? []);
      setHechas((h.data as Liquidacion[]) ?? []);
    });
    return () => { vivo = false; };
  }, [yo.business_id, hasta, version]);

  async function liquidar(f: FilaPendiente) {
    if (!window.confirm(`Liquidar ${formatearARS(f.a_pagar)} a ${nombre(f.barber_membership_id)} (${f.cantidad} ventas hasta el ${hasta.split("-").reverse().join("/")})? Después no se podrán anular esas ventas.`)) return;
    setEnviando(f.barber_membership_id);
    setMsg(null);
    const { error } = await getSupabase().rpc("settle_commissions", { p_business: yo.business_id, p_membership: f.barber_membership_id, p_upto: hasta, p_note: null });
    setEnviando(null);
    if (error) setMsg(error.message); else onCambio();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Liquidación de comisiones</h2>
      <p className="texto-suave text-sm">Lo que corresponde pagar a cada barbero con comisión por porcentaje. Una vez liquidadas, esas ventas no se vuelven a contar.</p>
      <label className="flex items-center gap-2 text-sm">Hasta el
        <input className="campo w-44" type="date" value={hasta} max={hoyAR()} onChange={(e) => e.target.value && setHasta(e.target.value)} />
      </label>
      {pendiente.length === 0 ? <p className="texto-suave text-sm">No hay comisiones pendientes hasta esa fecha.</p> : (
        <ul className="flex flex-col gap-2">
          {pendiente.map((f) => (
            <li key={f.barber_membership_id} className="flex items-center justify-between gap-3 tarjeta text-sm">
              <span><span className="block font-medium">{nombre(f.barber_membership_id)}</span><span className="texto-suave">{f.cantidad} ventas · {formatearARS(f.vendido)} vendidos</span></span>
              <button className="boton-chico" disabled={enviando !== null} onClick={() => liquidar(f)}>Pagar {formatearARS(f.a_pagar)}</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
      {hechas.length > 0 && (
        <details>
          <summary className="texto-suave cursor-pointer text-sm">Liquidaciones hechas</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {hechas.map((l) => <li key={l.id} className="flex justify-between"><span>{formatearHora(l.created_at)} · {nombre(l.barber_membership_id)}</span><span>{formatearARS(l.amount)}</span></li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
