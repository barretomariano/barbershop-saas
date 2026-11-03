"use client";

import { useMemo } from "react";
import { formatearARS } from "@/lib/dinero";
import { acumuladoMes, armarSerie, desdeDias, desdeGastos, desdeHoras, desempeno, margenPct, matrizCalor, mesesRecientes, planSerie, resumenRecurrencia, textoMejorHorario, type FilaValor } from "@/lib/series";
import { hoyAR, type Periodo } from "@/lib/periodos";
import { variacion, type Variacion } from "@/lib/calculos";
import { rangoDia, sumarDias } from "@/lib/turnos";
import type { FilaCalor, FilaDia, FilaHora, FilaRecurrencia, FilaRentabilidadServicio, FilaResumenVentas, Membresia } from "@/lib/tipos";
import type { Destino } from "@/lib/navegacion";
import { Barra, Esqueleto, Tarjeta, num, useRpc } from "@/components/capsulas";
import { BarrasDobles, GraficoArea, MapaCalor, TiraMeses } from "@/components/graficos";

export interface VProps {
  yo: Membresia; gestion: boolean; periodo: Periodo; ancho: 1 | 2; version: number;
  ancla?: Date;    // período pasado: el último minuto de ese período (ver anclaDe)
  rotulo?: string; // nombre del período pasado para los textos ("octubre 2026")
  nombre: (id: string) => string; irA: (d: Destino) => void;
}

const NOMBRE: Record<Periodo, string> = { hoy: "hoy", semana: "esta semana", mes: "este mes", anio: "este año" };
const nombreDe = (p: Periodo, rotulo?: string) => rotulo ?? NOMBRE[p];
const peso = (n: number) => formatearARS(Math.round(n));

// Convertidores estables (definidos afuera para no volver a llamar a la base en cada render).
const aDia = (f: Record<string, unknown>): FilaDia => ({ dia: String(f.dia), cantidad: num(f.cantidad), vendido: num(f.vendido), para_local: num(f.para_local) });
const aHora = (f: Record<string, unknown>): FilaHora => ({ hora: num(f.hora), cantidad: num(f.cantidad), vendido: num(f.vendido) });
const aCalor = (f: Record<string, unknown>): FilaCalor => ({ dia_semana: num(f.dia_semana), hora: num(f.hora), cantidad: num(f.cantidad), vendido: num(f.vendido) });
const aRecurrencia = (f: Record<string, unknown>): FilaRecurrencia => ({ con_cliente: num(f.con_cliente), recurrentes: num(f.recurrentes), intervalo_dias: f.intervalo_dias === null || f.intervalo_dias === undefined ? null : num(f.intervalo_dias), dormidos: num(f.dormidos) });
const aGasto = (f: Record<string, unknown>) => ({ dia: String(f.dia), total: num(f.total) });
const aVenta = (f: Record<string, unknown>): FilaResumenVentas => ({ barber_membership_id: String(f.barber_membership_id), payment_method: f.payment_method as FilaResumenVentas["payment_method"], cantidad: num(f.cantidad), vendido: num(f.vendido), para_barbero: num(f.para_barbero), para_local: num(f.para_local) });
const aRentServicio = (f: Record<string, unknown>): FilaRentabilidadServicio => ({ service_name: String(f.service_name), cantidad: num(f.cantidad), vendido: num(f.vendido), para_local: num(f.para_local) });

// Rango de los últimos `dias` días (fijo mientras no se refresque, para no repetir la consulta).
function useUltimosDias(dias: number, version: number) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => ({ p_desde: rangoDia(sumarDias(hoyAR(), -(dias - 1)))!.desde, p_hasta: rangoDia(sumarDias(hoyAR(), 1))!.desde }), [dias, version]);
}

function Cargando({ titulo, ancho, alto = 150 }: { titulo: string; ancho: 1 | 2; alto?: number }) {
  return <Tarjeta titulo={titulo} ancho={ancho}><Esqueleto alto={alto} /></Tarjeta>;
}

function Pill({ v, texto }: { v: Variacion; texto: string }) {
  return <span className="pill" data-signo={v.direccion}>{texto}</span>;
}

function textoPct(v: Variacion, contra: string): string {
  if (v.direccion === "sin-base") return "Sin datos para comparar";
  if (v.direccion === "igual") return `Igual ${contra}`;
  const p = v.pct ?? 0;
  return `${p > 0 ? "+" : ""}${p}% ${contra}`;
}

// ---------------------------------------------------------------------------------------------------------------
export function ResumenMes({ yo, gestion, ancho, version, irA }: VProps) {
  const args = useMemo(() => {
    const hoy = hoyAR();
    const idx = Number(hoy.slice(0, 4)) * 12 + Number(hoy.slice(5, 7)) - 1 - 5;
    const primero = `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}-01`;
    return { p_business: yo.business_id, p_desde: rangoDia(primero)!.desde, p_hasta: rangoDia(sumarDias(hoy, 1))!.desde };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yo.business_id, version]);
  const { filas } = useRpc("serie_diaria", args, aDia, version);
  const titulo = gestion ? "Tu barbería este mes" : "Tu mes";
  if (!filas) return <Cargando titulo={titulo} ancho={ancho} alto={190} />;
  const hoy = hoyAR();
  const { actual, previo } = acumuladoMes(filas, hoy);
  const v = variacion(actual, previo);
  const dif = actual - previo;
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("ventas")}>
      <TiraMeses meses={mesesRecientes(filas, hoy, 6)} />
      <p className="texto-suave mt-1 text-sm">{gestion ? "Este mes la barbería vendió" : "Este mes vendiste"}</p>
      <p className="monto text-[34px] leading-none">{formatearARS(actual)}</p>
      <p className="texto-suave text-sm">
        {v.direccion === "sin-base" ? "Todavía no hay un mes anterior para comparar." : `${dif >= 0 ? formatearARS(dif) + " más" : formatearARS(-dif) + " menos"} que a esta altura del mes pasado.`}
      </p>
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
function useSeries(periodo: Periodo, yo: Membresia, version: number, nombre: "serie_diaria" | "serie_gastos", conPrevio: boolean, ancla?: Date) {
  const marca = ancla?.getTime();
  const plan = useMemo(() => planSerie(periodo, ancla), [periodo, version, marca]); // eslint-disable-line react-hooks/exhaustive-deps
  const hora = plan.tipo === "hora" && nombre === "serie_diaria";
  const rpcNombre = hora ? "ventas_por_hora" : nombre;
  const conv = hora ? aHora : nombre === "serie_gastos" ? aGasto : aDia;
  const actual = useRpc<unknown>(rpcNombre, { p_business: yo.business_id, p_desde: plan.desde, p_hasta: plan.hasta }, conv as (f: Record<string, unknown>) => unknown, version);
  const previo = useRpc<unknown>(rpcNombre, conPrevio ? { p_business: yo.business_id, p_desde: plan.antDesde, p_hasta: plan.antHasta } : null, conv as (f: Record<string, unknown>) => unknown, version);
  return { plan, hora, actual: actual.filas, previo: previo.filas, error: actual.error || previo.error };
}

const comoValor = (hora: boolean, filas: unknown[], campo: "vendido" | "para_local" | "cantidad" = "vendido"): FilaValor[] =>
  hora ? desdeHoras(filas as FilaHora[]) : desdeDias(filas as FilaDia[], campo);

export function Tendencia({ yo, gestion, periodo, ancho, version, irA, ancla, rotulo }: VProps) {
  const { plan, hora, actual, previo, error } = useSeries(periodo, yo, version, "serie_diaria", true, ancla);
  const titulo = gestion ? "Ventas en el tiempo" : "Tus ventas en el tiempo";
  if (!actual || !previo) return <Cargando titulo={titulo} ancho={ancho} alto={230} />;
  const s = armarSerie(plan, comoValor(hora, actual), comoValor(hora, previo));
  const tope = s.transcurridos;
  const suma = (xs: (number | null)[], n: number) => xs.slice(0, n).reduce<number>((t, v) => t + (v ?? 0), 0);
  const v = variacion(suma(s.actual, tope), suma(s.previo, tope));
  const contra = rotulo ? "que el período anterior" : { hoy: "que ayer", semana: "que la semana pasada", mes: "que el mes pasado", anio: "que el año pasado" }[periodo];
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("reportes")}>
      {error && <p role="alert" className="text-sm text-red-600">No se pudieron cargar todos los datos.</p>}
      <Pill v={v} texto={textoPct(v, contra)} />
      <GraficoArea etiquetas={s.etiquetas} actual={s.actual} previo={s.previo} formato={peso} etiquetaPrevio="Antes"
        descripcion={`Ventas ${nombreDe(periodo, rotulo)} comparadas con el período anterior`} />
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function Horarios({ yo, gestion, ancho, version, irA }: VProps) {
  const rango = useUltimosDias(90, version);
  const { filas } = useRpc("mapa_calor", { p_business: yo.business_id, ...rango }, aCalor, version);
  const titulo = gestion ? "Horarios con más movimiento" : "Tus mejores horas";
  if (!filas) return <Cargando titulo={titulo} ancho={ancho} alto={200} />;
  const calor = matrizCalor(filas, "cantidad");
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("reportes")}>
      {calor.total === 0 ? <p className="texto-suave text-sm">Todavía no hay ventas suficientes para armar el mapa.</p> : (
        <>
          <p className="titulo text-[22px] leading-tight">{textoMejorHorario(calor.mejor)}</p>
          <p className="texto-suave text-xs">{gestion ? "El horario más cargado" : "Tu horario más fuerte"}, últimos 90 días.</p>
          <MapaCalor calor={calor} unidad="ventas" />
        </>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function Recurrencia({ yo, gestion, ancho, version, irA }: VProps) {
  const rango = useUltimosDias(90, version);
  const { filas } = useRpc("recurrencia_clientes", { p_business: yo.business_id, ...rango }, aRecurrencia, version);
  const titulo = gestion ? "Clientes que vuelven" : "Tus clientes que vuelven";
  if (!filas) return <Cargando titulo={titulo} ancho={ancho} alto={130} />;
  const r = resumenRecurrencia(filas[0]);
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("clientes")}>
      {r.conCliente === 0 ? <p className="texto-suave text-sm">Todavía no hay ventas con cliente cargado. Elegí el cliente al cobrar para ver cuántos vuelven.</p> : (
        <>
          <div className="flex items-end justify-between gap-3">
            <p className="monto text-[40px] leading-none">{r.pctVuelven}%</p>
            <p className="texto-suave text-right text-xs">{r.recurrentes} de {r.conCliente} clientes<br />vinieron más de una vez<br />en 90 días</p>
          </div>
          <Barra pct={r.pctVuelven} />
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div className="rounded-[20px] p-3" style={{ background: "var(--sup-2)" }}>
              <p className="monto text-xl">{r.intervalo === null ? "—" : `${String(r.intervalo).replace(".", ",")} días`}</p>
              <p className="texto-suave text-xs">entre una visita y la siguiente</p>
            </div>
            <div className="rounded-[20px] p-3" style={{ background: "var(--sup-2)" }}>
              <p className="monto text-xl">{r.dormidos}</p>
              <p className="texto-suave text-xs">{r.dormidos === 1 ? "cliente no vuelve" : "clientes no vuelven"} hace más de 45 días</p>
            </div>
          </div>
        </>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function Rentabilidad({ yo, periodo, ancho, version, nombre, irA, ancla, rotulo }: VProps) {
  const marca = ancla?.getTime();
  const plan = useMemo(() => planSerie(periodo, ancla), [periodo, version, marca]); // eslint-disable-line react-hooks/exhaustive-deps
  const args = { p_business: yo.business_id, p_desde: plan.desde, p_hasta: plan.hasta };
  const ventas = useRpc("resumen_ventas", args, aVenta, version);
  const servicios = useRpc("rentabilidad_servicios", args, aRentServicio, version);
  const titulo = "Rentabilidad";
  if (!ventas.filas || !servicios.filas) return <Cargando titulo={titulo} ancho={ancho} alto={220} />;
  const porBarbero = Array.from(new Set(ventas.filas.map((f) => f.barber_membership_id))).map((mid) => {
    const g = ventas.filas!.filter((f) => f.barber_membership_id === mid);
    return { mid, vendido: g.reduce((s, f) => s + f.vendido, 0), local: g.reduce((s, f) => s + f.para_local, 0) };
  }).sort((a, b) => b.local - a.local);
  const vendido = porBarbero.reduce((s, f) => s + f.vendido, 0);
  const local = porBarbero.reduce((s, f) => s + f.local, 0);
  const maxB = Math.max(1, ...porBarbero.map((f) => f.local));
  const maxS = Math.max(1, ...servicios.filas.map((f) => f.para_local));
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("reportes")}>
      {vendido === 0 ? <p className="texto-suave text-sm">Sin ventas {nombreDe(periodo, rotulo)}.</p> : (
        <>
          <p className="texto-suave text-sm">De cada $100 que se venden {nombreDe(periodo, rotulo)}, al local le quedan</p>
          <p className="monto text-[34px] leading-none">${margenPct(vendido, local)} <span className="texto-suave text-sm">({formatearARS(local)})</span></p>
          <p className="titulo-tarjeta mt-2">Aporte de cada barbero al local</p>
          <ul className="flex flex-col gap-3 text-sm">
            {porBarbero.map((f) => (
              <li key={f.mid} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2"><span className="truncate">{nombre(f.mid)} <span className="texto-suave">· {margenPct(f.vendido, f.local)}%</span></span><span className="monto">{formatearARS(f.local)}</span></span>
                <Barra pct={(f.local / maxB) * 100} />
              </li>
            ))}
          </ul>
          <p className="titulo-tarjeta mt-2">Servicios que más le dejan al local</p>
          <ul className="flex flex-col gap-3 text-sm">
            {servicios.filas.slice(0, 4).map((s) => (
              <li key={s.service_name} className="flex flex-col gap-1">
                <span className="flex justify-between gap-2"><span className="truncate">{s.service_name} <span className="texto-suave">· {margenPct(s.vendido, s.para_local)}%</span></span><span className="monto">{formatearARS(s.para_local)}</span></span>
                <Barra pct={(s.para_local / maxS) * 100} color="var(--par-vivo)" />
              </li>
            ))}
          </ul>
        </>
      )}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function Flujo({ yo, periodo, ancho, version, irA, ancla, rotulo }: VProps) {
  const ing = useSeries(periodo, yo, version, "serie_diaria", false, ancla);
  const gas = useSeries(periodo, yo, version, "serie_gastos", false, ancla);
  const titulo = "Lo que entra y lo que sale";
  // Para "hoy" las ventas vienen por hora y los gastos por día: se comparan los totales.
  const diario = useRpc<FilaDia>("serie_diaria", ing.hora ? { p_business: yo.business_id, p_desde: ing.plan.desde, p_hasta: ing.plan.hasta } : null, aDia, version);
  if (!ing.actual || !gas.actual || (ing.hora && !diario.filas)) return <Cargando titulo={titulo} ancho={ancho} alto={210} />;

  const gastos = gas.actual as { dia: string; total: number }[];
  const ingresosDia = (ing.hora ? diario.filas ?? [] : (ing.actual as FilaDia[]));
  const totalLocal = ingresosDia.reduce((s, f) => s + f.para_local, 0);
  const totalGastos = gastos.reduce((s, f) => s + f.total, 0);
  const neto = totalLocal - totalGastos;
  const encabezado = (
    <>
      <p className="texto-suave text-sm">{rotulo ? `${rotulo[0].toUpperCase()}${rotulo.slice(1)}` : periodo === "hoy" ? "Hoy" : `Lo que va ${nombreDe(periodo, rotulo)}`}, al local le quedó</p>
      <p className="monto text-[30px] leading-none" style={{ color: neto < 0 ? "var(--peligro)" : undefined }}>{formatearARS(neto)}</p>
      <p className="texto-suave text-xs">{formatearARS(totalLocal)} de ventas para el local menos {formatearARS(totalGastos)} de gastos.</p>
    </>
  );
  if (ing.hora) return <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("gastos")}>{encabezado}</Tarjeta>;
  const a = armarSerie(ing.plan, desdeDias(ingresosDia, "para_local"), []);
  const b = armarSerie(ing.plan, desdeGastos(gastos), []);
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("gastos")}>
      {encabezado}
      <BarrasDobles etiquetas={a.etiquetas} a={a.actual} b={b.actual.map((v, i) => (a.actual[i] === null ? null : v))} nombreA="Para el local" nombreB="Gastos" formato={peso}
        descripcion={`Ingresos del local y gastos ${nombreDe(periodo, rotulo)}`} />
    </Tarjeta>
  );
}

// ---------------------------------------------------------------------------------------------------------------
export function Desempeno({ yo, periodo, ancho, version, irA, ancla, rotulo }: VProps) {
  const { plan, hora, actual, previo } = useSeries(periodo, yo, version, "serie_diaria", true, ancla);
  const horas = useRpc("ventas_por_hora", { p_business: yo.business_id, p_desde: plan.desde, p_hasta: plan.hasta }, aHora, version);
  const diaria = useRpc<FilaDia>("serie_diaria", hora ? { p_business: yo.business_id, p_desde: plan.desde, p_hasta: plan.hasta } : null, aDia, version);
  const titulo = "Tu rendimiento";
  if (!actual || !previo || !horas.filas || (hora && !diaria.filas)) return <Cargando titulo={titulo} ancho={ancho} alto={170} />;
  const serie = hora ? diaria.filas ?? [] : (actual as FilaDia[]);
  const d = desempeno(serie, horas.filas);
  const dPrev = hora ? null : desempeno(previo as FilaDia[], []);
  const v = dPrev ? variacion(d.cortesPorDia, dPrev.cortesPorDia) : null;
  return (
    <Tarjeta titulo={titulo} ancho={ancho} ir={() => irA("ventas")}>
      {d.cortes === 0 ? <p className="texto-suave text-sm">Sin ventas {nombreDe(periodo, rotulo)}.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Dato valor={String(d.cortesPorDia).replace(".", ",")} texto="cortes por día trabajado" extra={v && v.direccion !== "sin-base" ? <Pill v={v} texto={textoPct(v, "que antes")} /> : null} />
            <Dato valor={formatearARS(d.ticket)} texto="ticket promedio" />
            <Dato valor={String(d.cortes)} texto={`${d.cortes === 1 ? "corte" : "cortes"} ${nombreDe(periodo, rotulo)}`} />
            <Dato valor={d.mejorHora === null ? "—" : `${d.mejorHora} h`} texto="tu hora más fuerte" />
          </div>
        </>
      )}
    </Tarjeta>
  );
}

function Dato({ valor, texto, extra }: { valor: string; texto: string; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-[22px] p-3" style={{ background: "var(--sup-2)" }}>
      <p className="monto text-2xl leading-none">{valor}</p>
      <p className="texto-suave text-xs">{texto}</p>
      {extra}
    </div>
  );
}
