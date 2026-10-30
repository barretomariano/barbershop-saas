"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { formatearARS } from "@/lib/dinero";
import { mesActual, rangoPeriodo } from "@/lib/periodos";
import { alertasDePresupuesto, nivelPresupuesto } from "@/lib/gestion";
import { parsearMonto } from "@/lib/validacion";
import { BotonAccion, Campo, EncabezadoHoja, Fichas, Hoja, Icono, PieHoja, type NombreIcono } from "@/components/ui";
import { CATEGORIAS_GASTO, type CategoriaGasto, type FilaResumenGastos, type GastoRecurrente, type Membresia, type Presupuesto, type Proveedor } from "@/lib/tipos";

const TELEFONO_OK = /^[0-9+() -]{6,20}$/;
const etiqueta = (c: CategoriaGasto) => CATEGORIAS_GASTO.find((x) => x.valor === c)?.etiqueta ?? c;

type Abierto = "pres" | "rec" | "prov";
const FILAS: { id: Abierto; titulo: string; detalle: string; icono: NombreIcono }[] = [
  { id: "pres", titulo: "Presupuesto del mes", detalle: "Un tope por categoría, con aviso", icono: "metas" },
  { id: "rec", titulo: "Gastos que se repiten", detalle: "Alquiler, servicios: se cargan solos", icono: "historial" },
  { id: "prov", titulo: "Proveedores", detalle: "A quién le comprás", icono: "equipo" },
];

export default function GastosAvanzados({ yo, onGenerado }: { yo: Membresia; onGenerado: () => void }) {
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const fila = FILAS.find((f) => f.id === abierto);
  return (
    <div className="flex flex-col gap-2">
      <p className="titulo-tarjeta px-2">Gestión</p>
      <div className="grupo-ajustes">
        {FILAS.map((f) => (
          <button key={f.id} className="fila-ajuste" onClick={() => setAbierto(f.id)}>
            <span className="icono-caja"><Icono nombre={f.icono} tam={20} /></span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{f.titulo}</span>
              <span className="texto-suave truncate text-sm">{f.detalle}</span>
            </span>
            <Icono nombre="siguiente" tam={18} className="texto-suave" />
          </button>
        ))}
      </div>
      {fila && (
        <Hoja titulo={fila.titulo} onCerrar={() => setAbierto(null)} ancho>
          <EncabezadoHoja titulo={fila.titulo} detalle={fila.detalle} onCerrar={() => setAbierto(null)} />
          {abierto === "pres" && <Presupuestos yo={yo} version={version} />}
          {abierto === "rec" && <Recurrentes yo={yo} version={version} onCambio={recargar} onGenerado={onGenerado} />}
          {abierto === "prov" && <Proveedores yo={yo} version={version} onCambio={recargar} />}
        </Hoja>
      )}
    </div>
  );
}

function Presupuestos({ yo, version }: { yo: Membresia; version: number }) {
  const esOwner = yo.role === "OWNER";
  const mes = mesActual();
  const [pres, setPres] = useState<Presupuesto[]>([]);
  const [gastos, setGastos] = useState<FilaResumenGastos[]>([]);
  const [edicion, setEdicion] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [n, setN] = useState(0);

  useEffect(() => {
    let vivo = true;
    const r = rangoPeriodo("mes");
    const sb = getSupabase();
    void Promise.all([
      sb.from("budgets").select("category,month,amount").eq("business_id", yo.business_id).eq("month", mes),
      sb.rpc("resumen_gastos", { p_business: yo.business_id, p_desde: r.desde, p_hasta: r.hasta }),
    ]).then(([p, g]) => {
      if (!vivo) return;
      const lista = (p.data as Presupuesto[]) ?? [];
      setPres(lista);
      setGastos((g.data as FilaResumenGastos[]) ?? []);
      setEdicion(Object.fromEntries(lista.map((x) => [x.category, String(x.amount)])));
    });
    return () => { vivo = false; };
  }, [yo.business_id, mes, version, n]);

  async function guardar() {
    setMsg(null);
    for (const c of CATEGORIAS_GASTO) {
      const t = (edicion[c.valor] ?? "").trim();
      const monto = t === "" ? 0 : parsearMonto(t);
      if (monto === null) { setMsg("Revisá los montos: pesos enteros, sin centavos ni signos."); return; }
      const actual = pres.find((p) => p.category === c.valor)?.amount ?? 0;
      if (monto === actual) continue;
      const { error } = await getSupabase().rpc("set_budget", { p_business: yo.business_id, p_category: c.valor, p_month: mes, p_amount: monto });
      if (error) { setMsg(error.message); return; }
    }
    setMsg("Presupuestos guardados.");
    setN((x) => x + 1);
  }

  const alertas = alertasDePresupuesto(gastos, pres);
  return (
    <section className="flex flex-col gap-3">
      {alertas.map((a) => (
        <p key={a.categoria} role="status" className={`tarjeta text-sm ${a.nivel === "excedido" ? "text-red-600" : ""}`} style={{ borderColor: a.nivel === "excedido" ? "var(--peligro)" : "var(--acento)" }}>
          {a.nivel === "excedido" ? "Te pasaste" : "Estás cerca del límite"} en {etiqueta(a.categoria)}: {formatearARS(a.gastado)} de {formatearARS(a.presupuesto)}.
        </p>
      ))}
      <ul className="flex flex-col gap-2 text-sm">
        {CATEGORIAS_GASTO.map((c) => {
          const p = pres.find((x) => x.category === c.valor);
          const gastado = gastos.filter((g) => g.category === c.valor).reduce((s, g) => s + g.total, 0);
          return (
            <li key={c.valor} className="flex items-center justify-between gap-3">
              <span>{c.etiqueta}<span className="texto-suave block text-xs">Gastado: {formatearARS(gastado)}{p && nivelPresupuesto(gastado, p.amount) !== "ok" ? " ⚠" : ""}</span></span>
              {esOwner
                ? <input className="campo w-36" inputMode="numeric" placeholder="Sin límite" aria-label={`Presupuesto ${c.etiqueta}`} value={edicion[c.valor] ?? ""} onChange={(e) => setEdicion({ ...edicion, [c.valor]: e.target.value })} />
                : <span>{p ? formatearARS(p.amount) : "Sin límite"}</span>}
            </li>
          );
        })}
      </ul>
      {esOwner && <div className="flex items-center gap-3"><button className="boton-chico" onClick={guardar}>Guardar presupuestos</button>{msg && <span role="status" className="text-sm">{msg}</span>}</div>}
    </section>
  );
}

function Recurrentes({ yo, version, onCambio, onGenerado }: { yo: Membresia; version: number; onCambio: () => void; onGenerado: () => void }) {
  const [lista, setLista] = useState<GastoRecurrente[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categoria, setCategoria] = useState<CategoriaGasto>("ALQUILER");
  const [detalle, setDetalle] = useState("");
  const [monto, setMonto] = useState("");
  const [dia, setDia] = useState(1);
  const [proveedor, setProveedor] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    let vivo = true;
    const sb = getSupabase();
    void Promise.all([
      sb.from("recurring_expenses").select("id,business_id,category,description,amount,day_of_month,supplier_id,active").eq("business_id", yo.business_id).order("day_of_month"),
      sb.from("suppliers").select("id,business_id,name,phone,notes,active").eq("business_id", yo.business_id).eq("active", true).order("name"),
    ]).then(([r, p]) => {
      if (!vivo) return;
      setLista((r.data as GastoRecurrente[]) ?? []);
      setProveedores((p.data as Proveedor[]) ?? []);
    });
    return () => { vivo = false; };
  }, [yo.business_id, version]);

  async function agregar() {
    const m = parsearMonto(monto);
    if (!m) { setMsg("Escribí un monto válido en pesos enteros."); return; }
    const { error } = await getSupabase().from("recurring_expenses").insert({
      business_id: yo.business_id, category: categoria, description: detalle.trim() || null, amount: m, day_of_month: dia, supplier_id: proveedor || null,
    });
    if (error) { setMsg("No se pudo guardar."); return; }
    setMonto(""); setDetalle(""); setMsg(null); setNuevo(false);
    const { data } = await getSupabase().rpc("generate_recurring_expenses", { p_business: yo.business_id });
    if (Number(data) > 0) onGenerado();
    onCambio();
  }

  async function alternar(r: GastoRecurrente) {
    await getSupabase().from("recurring_expenses").update({ active: !r.active }).eq("id", r.id);
    onCambio();
  }

  return (
    <section className="flex flex-col gap-3">
      <p className="texto-suave text-sm">Se cargan solos una vez por mes, a partir del día que elijas (1 a 28).</p>
      <BotonAccion texto="Agregar gasto mensual" onClick={() => { setMsg(null); setNuevo(true); }} />
      <ul className="flex flex-col gap-1 text-sm">
        {lista.map((r) => (
          <li key={r.id} className={`flex items-center justify-between gap-2 ${r.active ? "" : "opacity-60"}`}>
            <span>{r.description || etiqueta(r.category)} · {formatearARS(r.amount)} · día {r.day_of_month}</span>
            <button className="text-xs underline" onClick={() => alternar(r)}>{r.active ? "Pausar" : "Reactivar"}</button>
          </li>
        ))}
        {lista.length === 0 && <li className="texto-suave">Todavía no cargaste ninguno.</li>}
      </ul>
      {nuevo && (
        <Hoja titulo="Nuevo gasto mensual" onCerrar={() => setNuevo(false)}>
          <div className="formulario">
            <EncabezadoHoja titulo="Nuevo gasto mensual" onCerrar={() => setNuevo(false)} />
            <div className="campo-grupo">
              <span className="campo-etiqueta">Categoría</span>
              <Fichas etiqueta="Categoría" valor={categoria} onCambio={setCategoria} opciones={CATEGORIAS_GASTO.map((c) => ({ valor: c.valor, texto: c.etiqueta }))} />
            </div>
            <Campo etiqueta="Detalle"><input className="campo" placeholder="Ej. Alquiler del local" maxLength={200} value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Campo>
            <div className="fila-2">
              <Campo etiqueta="Monto"><input className="campo" inputMode="numeric" placeholder="$ 0" value={monto} onChange={(e) => setMonto(e.target.value)} /></Campo>
              <Campo etiqueta="Día del mes">
                <select className="campo" value={dia} onChange={(e) => setDia(Number(e.target.value))}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Día {d}</option>)}
                </select>
              </Campo>
            </div>
            {proveedores.length > 0 && (
              <Campo etiqueta="Proveedor">
                <select className="campo" value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Campo>
            )}
            <PieHoja>
              {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
              <button className="boton" onClick={agregar}>Agregar gasto mensual</button>
            </PieHoja>
          </div>
        </Hoja>
      )}
    </section>
  );
}

function Proveedores({ yo, version, onCambio }: { yo: Membresia; version: number; onCambio: () => void }) {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void Promise.resolve(getSupabase().from("suppliers").select("id,business_id,name,phone,notes,active").eq("business_id", yo.business_id).eq("active", true).order("name"))
      .then(({ data }) => { if (vivo) setLista((data as Proveedor[]) ?? []); });
    return () => { vivo = false; };
  }, [yo.business_id, version]);

  async function agregar() {
    if (!nombre.trim()) { setMsg("Escribí el nombre del proveedor."); return; }
    if (telefono && !TELEFONO_OK.test(telefono)) { setMsg("Teléfono no válido."); return; }
    const { error } = await getSupabase().from("suppliers").insert({ business_id: yo.business_id, name: nombre.trim(), phone: telefono.trim() || null });
    if (error) { setMsg(error.message.includes("duplicate") ? "Ya existe un proveedor con ese nombre." : "No se pudo guardar."); return; }
    setNombre(""); setTelefono(""); setMsg(null); setNuevo(false); onCambio();
  }

  async function quitar(id: string) {
    await getSupabase().from("suppliers").update({ active: false }).eq("id", id);
    onCambio();
  }

  return (
    <section className="flex flex-col gap-3">
      <BotonAccion texto="Agregar proveedor" onClick={() => { setMsg(null); setNuevo(true); }} />
      <ul className="flex flex-col gap-1 text-sm">
        {lista.map((p) => <li key={p.id} className="flex justify-between"><span>{p.name}{p.phone ? ` · ${p.phone}` : ""}</span><button className="text-xs underline" onClick={() => quitar(p.id)}>Quitar</button></li>)}
        {lista.length === 0 && <li className="texto-suave">Todavía no cargaste proveedores.</li>}
      </ul>
      {nuevo && (
        <Hoja titulo="Nuevo proveedor" onCerrar={() => setNuevo(false)}>
          <div className="formulario">
            <EncabezadoHoja titulo="Nuevo proveedor" onCerrar={() => setNuevo(false)} />
            <Campo etiqueta="Nombre"><input className="campo" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} /></Campo>
            <Campo etiqueta="Teléfono (opcional)"><input className="campo" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} /></Campo>
            <PieHoja>
              {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
              <button className="boton" onClick={agregar}>Agregar proveedor</button>
            </PieHoja>
          </div>
        </Hoja>
      )}
    </section>
  );
}
