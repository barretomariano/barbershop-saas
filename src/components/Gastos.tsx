"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS, formatearHora } from "@/lib/dinero";
import { rangoPeriodo, type Periodo } from "@/lib/periodos";
import { explicarMontoInvalido, parsearMonto } from "@/lib/validacion";
import { CATEGORIAS_GASTO, type CategoriaGasto, type FilaResumenGastos, type FilaResumenVentas, type Gasto, type Membresia, type Proveedor } from "@/lib/tipos";
import GastosAvanzados from "@/components/GastosAvanzados";

interface Props { yo: Membresia }

const etiqueta = (c: CategoriaGasto) => CATEGORIAS_GASTO.find((x) => x.valor === c)?.etiqueta ?? c;

export default function Gastos({ yo }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [paraLocal, setParaLocal] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categoria, setCategoria] = useState<CategoriaGasto>("INSUMOS");
  const [monto, setMonto] = useState("");
  const [detalle, setDetalle] = useState("");
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedor, setProveedor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const clave = useRef<string>(crypto.randomUUID());

  const [version, setVersion] = useState(0);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let vivo = true;
    const { desde, hasta } = rangoPeriodo(periodo);
    const sb = getSupabase();
    void Promise.all([
      sb.from("expenses")
        .select("id,category,description,amount,spent_at,status,cancel_reason")
        .gte("spent_at", desde).lt("spent_at", hasta)
        .eq("business_id", yo.business_id)
        .order("spent_at", { ascending: false }).limit(500),
      sb.rpc("resumen_ventas", { p_business: yo.business_id, p_desde: desde, p_hasta: hasta }),
      sb.rpc("resumen_gastos", { p_business: yo.business_id, p_desde: desde, p_hasta: hasta }),
    ]).then(([g, v, t]) => {
      if (!vivo) return;
      if (g.error || v.error || t.error) setError("No se pudieron cargar los datos.");
      else {
        setError(null);
        setGastos((g.data as Gasto[]) ?? []);
        // Totales calculados en la base sobre todas las ventas y gastos válidos del período.
        setParaLocal(((v.data as FilaResumenVentas[]) ?? []).reduce((s, f) => s + f.para_local, 0));
        setTotalGastos(((t.data as FilaResumenGastos[]) ?? []).reduce((s, f) => s + f.total, 0));
      }
      setCargando(false);
    });
    return () => { vivo = false; };
  }, [periodo, version, yo.business_id]);

  // Carga los gastos recurrentes que correspondan al mes (no duplica) y trae los proveedores.
  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    void Promise.resolve(sb.rpc("generate_recurring_expenses", { p_business: yo.business_id })).then(({ data }) => {
      if (vivo && Number(data) > 0) setVersion((v) => v + 1);
    });
    void Promise.resolve(sb.from("suppliers").select("id,business_id,name,phone,notes,active").eq("business_id", yo.business_id).eq("active", true).order("name"))
      .then(({ data }) => { if (vivo) setProveedores((data as Proveedor[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id]);

  const resultado = paraLocal - totalGastos;
  const montoNum = parsearMonto(monto);

  async function guardar() {
    if (!montoNum) return;
    setEnviando(true);
    setError(null);
    const { error: e } = await getSupabase().rpc("register_expense", {
      p_business: yo.business_id,
      p_category: categoria,
      p_amount: montoNum,
      p_idempotency_key: clave.current,
      p_description: detalle,
      p_supplier: proveedor || null,
    });
    setEnviando(false);
    if (e) { setError(e.message); return; }
    clave.current = crypto.randomUUID();
    setMonto("");
    setDetalle("");
    recargar();
  }

  async function anular(id: string) {
    const motivo = window.prompt("Motivo de la anulación:");
    if (!motivo) return;
    const { error: e } = await getSupabase().rpc("cancel_expense", { p_expense: id, p_reason: motivo });
    if (e) setError(e.message); else recargar();
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 tarjeta">
        <h2 className="font-medium">Cargar un gasto</h2>
        <select className="campo" value={categoria} onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}>
          {CATEGORIAS_GASTO.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
        </select>
        <input className="campo" inputMode="numeric" placeholder="Monto en pesos" value={monto} onChange={(e) => setMonto(e.target.value)} />
        {explicarMontoInvalido(monto) && <p role="alert" className="text-sm text-red-600">{explicarMontoInvalido(monto)}</p>}
        {proveedores.length > 0 && (
          <select className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)} aria-label="Proveedor">
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <input className="campo" placeholder="Detalle (opcional)" maxLength={200} value={detalle} onChange={(e) => setDetalle(e.target.value)} />
        <button className="boton" disabled={!montoNum || enviando} onClick={guardar}>
          {enviando ? "Guardando…" : montoNum ? `Guardar ${formatearARS(montoNum)}` : "Guardar gasto"}
        </button>
      </div>

      <div className="flex gap-2">
        {(["hoy", "semana", "mes"] as Periodo[]).map((p) => (
          <button key={p} onClick={() => { setCargando(true); setPeriodo(p); }} className={`chip ${periodo === p ? "chip-activo" : ""}`}>
            {p === "hoy" ? "Hoy" : p === "semana" ? "Últimos 7 días" : "Este mes"}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {cargando ? <p className="texto-suave">Cargando…</p> : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Dato titulo="Para el local (ventas)" valor={formatearARS(paraLocal)} />
            <Dato titulo="Gastos" valor={formatearARS(totalGastos)} />
            <Dato titulo="Queda en el local" valor={formatearARS(resultado)} />
          </div>

          <div>
            <h2 className="mb-2 font-medium">Gastos</h2>
            {gastos.length === 0 ? <p className="texto-suave text-sm">No hay gastos en este período.</p> : (
              <ul className="flex flex-col gap-2 text-sm">
                {gastos.map((g) => (
                  <li key={g.id} className="flex items-start justify-between gap-3 border-b pb-2">
                    <div className={g.status === "CANCELED" ? "line-through opacity-60" : ""}>
                      <p>{formatearARS(g.amount)} · {etiqueta(g.category)}</p>
                      <p className="texto-suave">{formatearHora(g.spent_at)}{g.description ? ` · ${g.description}` : ""}</p>
                      {g.status === "CANCELED" && <p className="text-xs">Anulado: {g.cancel_reason}</p>}
                    </div>
                    {g.status === "VALID" && <button className="text-xs underline" onClick={() => anular(g.id)}>Anular</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <GastosAvanzados yo={yo} onGenerado={recargar} />
    </section>
  );
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="tarjeta">
      <p className="texto-suave text-sm">{titulo}</p>
      <p className="text-2xl font-semibold">{valor}</p>
    </div>
  );
}
