"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { hoyAR } from "@/lib/periodos";
import { aCSV, completarDias, mejorDiaSemana, ticketPromedio } from "@/lib/gestion";
import { DIAS_SEMANA, rangoDia, sumarDias } from "@/lib/turnos";
import type { FilaDia, FilaHora, FilaTopCliente, Membresia } from "@/lib/tipos";

const OPCIONES = [{ dias: 30, texto: "30 días" }, { dias: 90, texto: "90 días" }, { dias: 365, texto: "1 año" }];

export default function Reportes({ yo, hayClientes }: { yo: Membresia; hayClientes: boolean }) {
  const [dias, setDias] = useState(30);
  const [serie, setSerie] = useState<FilaDia[] | null>(null);
  const [horas, setHoras] = useState<FilaHora[]>([]);
  const [top, setTop] = useState<FilaTopCliente[]>([]);
  const [error, setError] = useState<string | null>(null);

  const desdeDia = sumarDias(hoyAR(), -(dias - 1));

  useEffect(() => {
    let vivo = true;
    const rango = rangoDia(sumarDias(hoyAR(), -(dias - 1)));
    if (!rango) return;
    const hasta = new Date(Date.now() + 60_000).toISOString();
    const sb = getSupabase();
    const args = { p_business: yo.business_id, p_desde: rango.desde, p_hasta: hasta };
    void Promise.all([
      sb.rpc("serie_diaria", args),
      sb.rpc("ventas_por_hora", args),
      hayClientes ? sb.rpc("top_clientes", { ...args, p_limite: 5 }) : Promise.resolve({ data: [], error: null }),
    ]).then(([s, h, t]) => {
      if (!vivo) return;
      if (s.error || h.error || t.error) setError("No se pudieron cargar los reportes.");
      else setError(null);
      setSerie((s.data as FilaDia[]) ?? []);
      setHoras((h.data as FilaHora[]) ?? []);
      setTop((t.data as FilaTopCliente[]) ?? []);
    });
    return () => { vivo = false; };
  }, [yo.business_id, dias, hayClientes]);

  if (serie === null) return <p className="texto-suave">Cargando…</p>;

  const vendido = serie.reduce((s, f) => s + f.vendido, 0);
  const cantidad = serie.reduce((s, f) => s + f.cantidad, 0);
  const completa = completarDias(serie, desdeDia, dias);
  const maxDia = Math.max(1, ...completa.map((f) => f.vendido));
  const maxHora = Math.max(1, ...horas.map((h) => h.vendido));
  const mejor = mejorDiaSemana(serie);
  const diasConVentas = serie.length;

  function exportar() {
    const filas: (string | number)[][] = [["Día", "Ventas", "Vendido", "Para el local"], ...serie!.map((f) => [f.dia, f.cantidad, f.vendido, f.para_local])];
    const url = URL.createObjectURL(new Blob([aCSV(filas)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ventas-${desdeDia}-a-${hoyAR()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {OPCIONES.map((o) => <button key={o.dias} onClick={() => setDias(o.dias)} className={`chip ${dias === o.dias ? "chip-activo" : ""}`}>{o.texto}</button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Dato titulo="Vendido" valor={formatearARS(vendido)} />
        <Dato titulo="Ventas" valor={String(cantidad)} />
        <Dato titulo="Ticket promedio" valor={formatearARS(ticketPromedio(vendido, cantidad))} />
        <Dato titulo="Promedio por día con ventas" valor={formatearARS(diasConVentas ? Math.round(vendido / diasConVentas) : 0)} />
      </div>
      {mejor && <p className="text-sm">Tu mejor día de la semana es el <strong>{DIAS_SEMANA.find((d) => d.valor === mejor.dia)?.largo.toLowerCase()}</strong> ({formatearARS(mejor.vendido)} en el período).</p>}

      <div>
        <h2 className="mb-2 font-medium">Ventas por día</h2>
        <div className="flex h-32 items-end gap-px overflow-x-auto" role="img" aria-label="Gráfico de ventas por día">
          {completa.map((f) => (
            <div key={f.dia} title={`${f.dia.split("-").reverse().join("/")}: ${formatearARS(f.vendido)}`} className="min-w-[3px] flex-1 rounded-t"
              style={{ height: `${Math.max(f.vendido ? 4 : 1, (f.vendido / maxDia) * 100)}%`, background: f.vendido ? "var(--acento)" : "var(--linea)" }} />
          ))}
        </div>
        <p className="texto-suave mt-1 flex justify-between text-xs"><span>{desdeDia.split("-").reverse().join("/")}</span><span>hoy</span></p>
      </div>

      <div>
        <h2 className="mb-2 font-medium">Horarios con más ventas</h2>
        {horas.length === 0 ? <p className="texto-suave text-sm">Sin ventas en el período.</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {horas.map((h) => (
              <li key={h.hora} className="flex items-center gap-2">
                <span className="w-12 shrink-0">{String(h.hora).padStart(2, "0")}:00</span>
                <div className="h-3 flex-1 overflow-hidden rounded" style={{ background: "var(--linea)" }}><div className="h-full" style={{ width: `${(h.vendido / maxHora) * 100}%`, background: "var(--acento)" }} /></div>
                <span className="w-10 shrink-0 text-right texto-suave">{h.cantidad}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {hayClientes && (
        <div>
          <h2 className="mb-2 font-medium">Mejores clientes</h2>
          {top.length === 0 ? <p className="texto-suave text-sm">Todavía no hay ventas asociadas a clientes.</p> : (
            <ol className="flex flex-col gap-1 text-sm">
              {top.map((c, i) => <li key={c.client_id} className="flex justify-between"><span>{i + 1}. {c.nombre} ({c.visitas})</span><span>{formatearARS(c.gastado)}</span></li>)}
            </ol>
          )}
        </div>
      )}

      <button className="boton-chico self-start" onClick={exportar} disabled={serie.length === 0}>Descargar CSV</button>
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--linea)" }}>
      <p className="texto-suave text-xs">{titulo}</p>
      <p className="text-xl font-semibold">{valor}</p>
    </div>
  );
}
