"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { diasDelPeriodo, hoyAR } from "@/lib/periodos";
import { sumarDias } from "@/lib/turnos";
import { aEntregar, esCobrable, esPedible, etiquetaDia, fechaCorta, pedidosPorBarbero, resumirCobros, textoAjuste, textoCobrado } from "@/lib/cobros";
import { marcarVisto } from "@/lib/avisoCobros";
import { Campo, EncabezadoHoja, Hoja, PieHoja, Segmentado } from "@/components/ui";
import SelectorPeriodo, { type Seleccion } from "@/components/SelectorPeriodo";
import { useCobros } from "@/components/useCobros";
import type { FilaCobro, Liquidacion, Membresia } from "@/lib/tipos";

// Cobros: el lugar donde barbero y dueño se ponen de acuerdo. El barbero ve cuánto hizo y pide cobrar sus días;
// el dueño o encargado acepta o rechaza. Aceptado = "Lunes cobrado". La app solo registra: no mueve plata.
export default function Cobros({ yo, equipo }: { yo: Membresia; equipo: Membresia[] }) {
  const gestion = yo.role !== "BARBER";
  const hoy = useMemo(() => hoyAR(), []);
  const [sel, setSel] = useState<Seleccion>({ periodo: "mes", offset: 0 });
  const [barbero, setBarbero] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const barberos = useMemo(() => equipo.filter((m) => m.role === "BARBER"), [equipo]);
  const { desde, hasta } = diasDelPeriodo("mes", sel.offset);
  const mes = useCobros(yo, desde, hasta);
  const reciente = useCobros(yo, sumarDias(hoy, -92), hoy);   // los pedidos pendientes pueden ser de meses anteriores
  const nombre = (id: string) => equipo.find((m) => m.id === id)?.display_name ?? "Barbero";

  useEffect(() => { if (!gestion) marcarVisto(yo.business_id, yo.user_id); }, [gestion, yo.business_id, yo.user_id]);
  const cambio = () => { mes.recargar(); reciente.recargar(); };

  if (!mes.filas || !reciente.filas) return <div className="esqueleto" style={{ height: 220 }} aria-busy="true" />;
  if (mes.error) return <p className="texto-suave">No se pudieron cargar los cobros. Probá de nuevo en un momento.</p>;

  const idBarbero = gestion ? (barbero || barberos[0]?.id || "") : yo.id;
  const filasMes = mes.filas.filter((f) => f.barber_membership_id === idBarbero);

  return (
    <div className="flex flex-col gap-6">
      {msg && <p role="status" className="tarjeta p-3 text-sm">{msg}</p>}
      {gestion
        ? <PedidosParaDecidir filas={reciente.filas} ajustes={mes.ajustes} nombre={nombre} yo={yo} onCambio={cambio} onMsg={setMsg} />
        : <MiPlata filas={reciente.filas} ajuste={mes.ajustes[yo.id] ?? 0} hoy={hoy} />}

      <section className="flex flex-col gap-3">
        <h2 className="titulo text-xl font-semibold">{gestion ? "Días por barbero" : "Tus días"}</h2>
        {gestion && barberos.length > 1 && (
          <Segmentado etiqueta="Barbero" valor={idBarbero} onCambio={setBarbero} opciones={barberos.map((b) => ({ valor: b.id, texto: b.display_name }))} />
        )}
        <SelectorPeriodo valor={sel} onCambio={(s) => setSel({ periodo: "mes", offset: s.offset })} soloPeriodos={["mes"]} />
        <TotalesMes filas={filasMes} />
        {gestion && textoAjuste(mes.ajustes[idBarbero] ?? 0, formatearARS, false) && <p className="texto-suave text-sm">{textoAjuste(mes.ajustes[idBarbero] ?? 0, formatearARS, false)}</p>}
        {!gestion && textoAjuste(mes.ajustes[yo.id] ?? 0, formatearARS, true) && <p className="texto-suave text-sm">{textoAjuste(mes.ajustes[yo.id] ?? 0, formatearARS, true)}</p>}
        <ListaDias key={`${idBarbero}-${sel.offset}`} filas={filasMes} hoy={hoy} yo={yo} idBarbero={idBarbero} gestion={gestion} ajuste={mes.ajustes[idBarbero] ?? 0} nombre={nombre(idBarbero)} onCambio={cambio} onMsg={setMsg} />
      </section>

      {gestion && <LiquidacionesViejas yo={yo} nombre={nombre} />}
    </div>
  );
}

// Barbero: cuánto hizo hoy, ayer y en el período, y cuánto le falta cobrar.
function MiPlata({ filas, ajuste, hoy }: { filas: FilaCobro[]; ajuste: number; hoy: string }) {
  const r = resumirCobros(filas, hoy);
  const falta = Math.max(0, r.porPedir + r.pedido + ajuste);
  return (
    <section className="tarjeta flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-4">
        <div><p className="texto-suave text-sm">Hoy hiciste</p><p className="monto">{formatearARS(r.hoy)}</p></div>
        <div><p className="texto-suave text-sm">Ayer</p><p className="monto">{formatearARS(r.ayer)}</p></div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="texto-suave">Te falta cobrar (últimos 3 meses)</span><strong className="monto">{formatearARS(falta)}</strong>
      </div>
    </section>
  );
}

function TotalesMes({ filas }: { filas: FilaCobro[] }) {
  const hecho = filas.reduce((t, f) => t + f.comision, 0);
  const cobrado = filas.reduce((t, f) => t + (f.estado === "PAID" ? (f.entregado ?? 0) : 0), 0);
  const falta = filas.filter((f) => f.estado !== "PAID").reduce((t, f) => t + f.comision, 0);
  return (
    <div className="tarjeta grid grid-cols-3 gap-2 p-3 text-center text-sm">
      <div><p className="texto-suave text-xs">Hecho</p><p className="font-semibold">{formatearARS(hecho)}</p></div>
      <div><p className="texto-suave text-xs">Cobrado</p><p className="font-semibold">{formatearARS(cobrado)}</p></div>
      <div><p className="texto-suave text-xs">Falta</p><p className="font-semibold">{formatearARS(falta)}</p></div>
    </div>
  );
}

const TEXTO_ESTADO = { SIN_PEDIR: "", REQUESTED: "Pedido", PAID: "Cobrado", REJECTED: "Rechazado" } as const;

function ListaDias({ filas, hoy, yo, idBarbero, gestion, ajuste, nombre, onCambio, onMsg }: {
  filas: FilaCobro[]; hoy: string; yo: Membresia; idBarbero: string; gestion: boolean; ajuste: number; nombre: string; onCambio: () => void; onMsg: (m: string) => void;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const elegible = gestion ? esCobrable : esPedible;
  const suma = filas.filter((f) => elegidos.includes(f.dia)).reduce((t, f) => t + f.comision, 0);

  const alternar = (dia: string) => setElegidos((l) => (l.includes(dia) ? l.filter((d) => d !== dia) : [...l, dia]));

  async function enviar() {
    if (elegidos.length === 0) return;
    if (gestion && !window.confirm(`¿Marcar ${elegidos.length} ${elegidos.length === 1 ? "día" : "días"} de ${nombre} como cobrados? Se le entregan ${formatearARS(aEntregar(suma, ajuste))}.`)) return;
    setEnviando(true);
    const sb = getSupabase();
    const r = gestion
      ? await sb.rpc("decide_payout", { p_business: yo.business_id, p_membership: idBarbero, p_days: elegidos, p_accept: true, p_reason: null })
      : await sb.rpc("request_payout", { p_business: yo.business_id, p_days: elegidos });
    setEnviando(false);
    if (r.error) { onMsg(r.error.message); return; }
    onMsg(gestion ? `Listo: ${formatearARS(Number(r.data))} entregados a ${nombre}.` : "Pedido enviado. Cuando el dueño lo acepte, aparece como cobrado.");
    setElegidos([]);
    onCambio();
  }

  if (filas.length === 0) return <p className="texto-suave text-sm">No hay ventas en este mes.</p>;
  return (
    <>
      <ul className="tarjeta divide-y" style={{ borderColor: "var(--linea)" }}>
        {filas.map((f) => {
          const puede = elegible(f);
          const marcado = elegidos.includes(f.dia);
          return (
            <li key={f.dia} className="fila-cobro" data-sel={marcado}>
              {puede
                ? <input type="checkbox" aria-label={`Elegir ${etiquetaDia(f.dia, hoy)}`} checked={marcado} onChange={() => alternar(f.dia)} style={{ width: 22, height: 22 }} />
                : <span style={{ width: 22 }} />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{f.estado === "PAID" ? textoCobrado(f.dia) : etiquetaDia(f.dia, hoy)}
                  {f.estado === "PAID" && <span className="texto-suave text-xs"> · {fechaCorta(f.dia)}</span>}</p>
                <p className="texto-suave text-xs">
                  {f.cantidad} {f.cantidad === 1 ? "venta" : "ventas"} · {formatearARS(f.vendido)}
                  {f.estado === "PAID" && f.entregado !== null && f.entregado !== f.monto_cobrado && ` · entregado ${formatearARS(f.entregado)} (con ajuste)`}
                </p>
                {f.estado === "REJECTED" && f.motivo && <p className="text-xs" style={{ color: "var(--peligro)" }}>Motivo: {f.motivo}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-semibold">{f.comision > 0 ? formatearARS(f.estado === "PAID" ? (f.monto_cobrado ?? f.comision) : f.comision) : "—"}</span>
                {f.comision > 0 && TEXTO_ESTADO[f.estado] && <span className="estado-cobro" data-e={f.estado}>{TEXTO_ESTADO[f.estado]}</span>}
              </div>
            </li>
          );
        })}
      </ul>
      {elegidos.length > 0 && (
        <button className="boton" disabled={enviando} onClick={() => void enviar()}>
          {gestion ? "Marcar cobrado" : "Pedir cobro"} · {elegidos.length} {elegidos.length === 1 ? "día" : "días"} · {formatearARS(suma)}
        </button>
      )}
    </>
  );
}

// Dueño / encargado: los pedidos de cobro de cada barbero, para aceptar o rechazar.
function PedidosParaDecidir({ filas, ajustes, nombre, yo, onCambio, onMsg }: {
  filas: FilaCobro[]; ajustes: Record<string, number>; nombre: (id: string) => string; yo: Membresia; onCambio: () => void; onMsg: (m: string) => void;
}) {
  const pedidos = pedidosPorBarbero(filas);
  const [rechazando, setRechazando] = useState<{ id: string; dias: string[] } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function decidir(id: string, dias: string[], aceptar: boolean, razon: string | null) {
    setEnviando(true);
    const r = await getSupabase().rpc("decide_payout", { p_business: yo.business_id, p_membership: id, p_days: dias, p_accept: aceptar, p_reason: razon });
    setEnviando(false);
    if (r.error) { onMsg(r.error.message); return; }
    onMsg(aceptar ? `Listo: ${formatearARS(Number(r.data))} entregados a ${nombre(id)}.` : `Pedido rechazado. ${nombre(id)} verá el motivo.`);
    setRechazando(null); setMotivo("");
    onCambio();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="titulo text-xl font-semibold">Pedidos para decidir{pedidos.length > 0 && <span className="aviso" />}</h2>
      {pedidos.length === 0 && <p className="texto-suave text-sm">No hay pedidos pendientes. Todo al día.</p>}
      {pedidos.map((p) => {
        const dias = p.dias.map((d) => d.dia);
        const entrega = aEntregar(p.total, ajustes[p.barber_membership_id] ?? 0);
        return (
          <article key={p.barber_membership_id} className="tarjeta flex flex-col gap-3 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-semibold">{nombre(p.barber_membership_id)}</h3>
              <span className="monto text-lg">{formatearARS(entrega)}</span>
            </div>
            <p className="texto-suave text-sm">{p.dias.map((d) => `${etiquetaDia(d.dia, hoyAR())} ${formatearARS(d.comision)}`).join(" · ")}</p>
            {textoAjuste(ajustes[p.barber_membership_id] ?? 0, formatearARS, false) && <p className="texto-suave text-xs">{textoAjuste(ajustes[p.barber_membership_id] ?? 0, formatearARS, false)}</p>}
            <div className="flex gap-2">
              <button className="boton flex-1" disabled={enviando} onClick={() => void decidir(p.barber_membership_id, dias, true, null)}>Aceptar</button>
              <button className="chip" disabled={enviando} onClick={() => setRechazando({ id: p.barber_membership_id, dias })}>Rechazar</button>
            </div>
          </article>
        );
      })}
      {rechazando && (
        <Hoja titulo="Rechazar pedido" onCerrar={() => setRechazando(null)}>
          <EncabezadoHoja titulo="Rechazar pedido" detalle={`${nombre(rechazando.id)} va a ver el motivo y puede volver a pedir.`} onCerrar={() => setRechazando(null)} />
          <Campo etiqueta="Motivo">
            <input className="campo" autoFocus value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: falta cargar un corte" />
          </Campo>
          <PieHoja>
            <button className="boton" disabled={enviando || motivo.trim().length < 3} onClick={() => void decidir(rechazando.id, rechazando.dias, false, motivo.trim())}>Rechazar pedido</button>
          </PieHoja>
        </Hoja>
      )}
    </section>
  );
}

// Liquidaciones del sistema anterior (por fecha): quedan solo para consulta.
function LiquidacionesViejas({ yo, nombre }: { yo: Membresia; nombre: (id: string) => string }) {
  const [lista, setLista] = useState<Liquidacion[]>([]);
  useEffect(() => {
    let vivo = true;
    void getSupabase().from("settlements").select("id,barber_membership_id,upto,sales_count,sales_total,amount,note,created_at")
      .eq("business_id", yo.business_id).order("created_at", { ascending: false }).limit(20)
      .then((r) => { if (vivo) setLista((r.data as Liquidacion[] | null) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id]);
  if (lista.length === 0) return null;
  return (
    <details className="tarjeta p-4">
      <summary className="cursor-pointer font-medium">Liquidaciones anteriores ({lista.length})</summary>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {lista.map((l) => (
          <li key={l.id} className="flex justify-between gap-3">
            <span>{nombre(l.barber_membership_id)} <span className="texto-suave">· hasta {fechaCorta(l.upto)} · {l.sales_count} ventas</span></span>
            <span className="font-semibold">{formatearARS(l.amount)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
