import { diasDesdeLunes, hoyAR, type Periodo } from "./periodos";
import { rangoDia, sumarDias } from "./turnos";
import type { FilaCalor, FilaDia, FilaHora, FilaRecurrencia } from "./tipos";

// Lógica pura de los gráficos: arma las series de cada período (con su período anterior alineado punto a punto),
// la tira de meses, el mapa de calor de horarios y la recurrencia de clientes. Todo en hora argentina.

const OFFSET_AR = -3 * 3_600_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_LETRA = ["L", "M", "X", "J", "V", "S", "D"];
export const DIAS_LARGO = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const DIAS_CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export type TipoSerie = "hora" | "dia" | "mes";

export interface PlanSerie {
  periodo: Periodo;
  tipo: TipoSerie;
  desde: string; hasta: string;         // ISO: el período completo (hasta = inicio del siguiente)
  antDesde: string; antHasta: string;   // ISO: el período anterior completo
  inicio: string; inicioAnt: string;    // primer día (AAAA-MM-DD) del período y del anterior
  etiquetas: string[];                  // una por punto del período actual
  largoAnt: number;                     // cuántos puntos tiene el período anterior
  transcurridos: number;                // cuántos puntos ya pasaron (el resto está en el futuro)
}

export interface FilaValor { dia: string; valor: number }
export interface SerieArmada { etiquetas: string[]; actual: (number | null)[]; previo: (number | null)[]; transcurridos: number }

const diasDelMesDe = (anio: number, mes0: number) => new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();
const iso = (dia: string) => rangoDia(dia)!.desde;

export function planSerie(periodo: Periodo, ahora: Date = new Date()): PlanSerie {
  const hoy = hoyAR(ahora);
  const [anio, mes] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1];
  const horaActual = new Date(ahora.getTime() + OFFSET_AR).getUTCHours();

  if (periodo === "hoy") {
    const ayer = sumarDias(hoy, -1);
    return {
      periodo, tipo: "hora", desde: iso(hoy), hasta: iso(sumarDias(hoy, 1)), antDesde: iso(ayer), antHasta: iso(hoy),
      inicio: hoy, inicioAnt: ayer, etiquetas: Array.from({ length: 24 }, (_, h) => `${h}h`), largoAnt: 24, transcurridos: horaActual + 1,
    };
  }
  if (periodo === "semana") {
    const lunes = sumarDias(hoy, -diasDesdeLunes(ahora));
    const lunesAnt = sumarDias(lunes, -7);
    return {
      periodo, tipo: "dia", desde: iso(lunes), hasta: iso(sumarDias(lunes, 7)), antDesde: iso(lunesAnt), antHasta: iso(lunes),
      inicio: lunes, inicioAnt: lunesAnt, etiquetas: DIAS_LETRA, largoAnt: 7, transcurridos: diasDesdeLunes(ahora) + 1,
    };
  }
  if (periodo === "mes") {
    const n = diasDelMesDe(anio, mes);
    const primero = `${hoy.slice(0, 8)}01`;
    const [aA, mA] = mes === 0 ? [anio - 1, 11] : [anio, mes - 1];
    const primeroAnt = `${aA}-${String(mA + 1).padStart(2, "0")}-01`;
    return {
      periodo, tipo: "dia", desde: iso(primero), hasta: iso(sumarDias(primero, n)), antDesde: iso(primeroAnt), antHasta: iso(primero),
      inicio: primero, inicioAnt: primeroAnt, etiquetas: Array.from({ length: n }, (_, i) => String(i + 1)), largoAnt: diasDelMesDe(aA, mA), transcurridos: Number(hoy.slice(8, 10)),
    };
  }
  const ene = `${anio}-01-01`;
  const eneAnt = `${anio - 1}-01-01`;
  return {
    periodo, tipo: "mes", desde: iso(ene), hasta: iso(`${anio + 1}-01-01`), antDesde: iso(eneAnt), antHasta: iso(ene),
    inicio: ene, inicioAnt: eneAnt, etiquetas: MESES, largoAnt: 12, transcurridos: mes + 1,
  };
}

function valores(tipo: TipoSerie, filas: FilaValor[], inicio: string, largo: number): number[] {
  const salida = new Array<number>(largo).fill(0);
  for (const f of filas) {
    let i = -1;
    if (tipo === "hora") i = Number(f.dia);
    else if (tipo === "dia") i = Math.round((new Date(`${f.dia}T12:00:00Z`).getTime() - new Date(`${inicio}T12:00:00Z`).getTime()) / 86_400_000);
    else i = (Number(f.dia.slice(0, 4)) - Number(inicio.slice(0, 4))) * 12 + Number(f.dia.slice(5, 7)) - 1;
    if (i >= 0 && i < largo) salida[i] += f.valor;
  }
  return salida;
}

// Alinea el período actual con el anterior punto a punto. Lo que todavía no pasó queda en null (la línea se corta).
export function armarSerie(plan: PlanSerie, actual: FilaValor[], previo: FilaValor[]): SerieArmada {
  const n = plan.etiquetas.length;
  const a = valores(plan.tipo, actual, plan.inicio, n);
  const p = valores(plan.tipo, previo, plan.inicioAnt, plan.largoAnt);
  return {
    etiquetas: plan.etiquetas,
    actual: a.map((v, i) => (i < plan.transcurridos ? v : null)),
    previo: Array.from({ length: n }, (_, i) => (i < plan.largoAnt ? p[i] : null)),
    transcurridos: plan.transcurridos,
  };
}

export const desdeDias = (filas: FilaDia[], campo: "vendido" | "para_local" | "cantidad" = "vendido"): FilaValor[] =>
  filas.map((f) => ({ dia: f.dia, valor: f[campo] }));
export const desdeHoras = (filas: FilaHora[]): FilaValor[] => filas.map((f) => ({ dia: String(f.hora), valor: f.vendido }));
export const desdeGastos = (filas: { dia: string; total: number }[]): FilaValor[] => filas.map((f) => ({ dia: f.dia, valor: f.total }));

// ---------- Tira de meses (últimos n, el actual al final) ----------
export interface MesTira { etiqueta: string; total: number; actual: boolean }

export function mesesRecientes(serie: FilaDia[], hoy: string, n = 6): MesTira[] {
  const [a0, m0] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1];
  const salida: MesTira[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const idx = a0 * 12 + m0 - k;
    const [a, m] = [Math.floor(idx / 12), idx % 12];
    const clave = `${a}-${String(m + 1).padStart(2, "0")}`;
    salida.push({ etiqueta: MESES[m], total: serie.filter((f) => f.dia.startsWith(clave)).reduce((s, f) => s + f.vendido, 0), actual: k === 0 });
  }
  return salida;
}

// Lo vendido este mes hasta hoy contra lo vendido el mes anterior hasta el mismo día.
export function acumuladoMes(serie: FilaDia[], hoy: string): { actual: number; previo: number } {
  const [a, m, d] = [Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10))];
  const [aP, mP] = m === 0 ? [a - 1, 11] : [a, m - 1];
  const clave = (y: number, mm: number) => `${y}-${String(mm + 1).padStart(2, "0")}`;
  const suma = (pref: string, tope: number) => serie.filter((f) => f.dia.startsWith(pref) && Number(f.dia.slice(8, 10)) <= tope).reduce((s, f) => s + f.vendido, 0);
  return { actual: suma(clave(a, m), d), previo: suma(clave(aP, mP), d) };
}

// ---------- Mapa de calor día × hora ----------
export interface Calor {
  celdas: number[][];                 // [dia 0..6 (lunes..domingo)][hora 0..23]
  max: number;
  total: number;
  mejor: { dia: number; hora: number; valor: number } | null;
  horaMin: number; horaMax: number;   // franja que se dibuja (con aire alrededor de lo que tiene datos)
}

export function matrizCalor(filas: FilaCalor[], campo: "cantidad" | "vendido" = "cantidad"): Calor {
  const celdas = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let max = 0, total = 0;
  let mejor: Calor["mejor"] = null;
  let [hMin, hMax] = [24, -1];
  for (const f of filas) {
    if (f.dia_semana < 0 || f.dia_semana > 6 || f.hora < 0 || f.hora > 23) continue;
    const v = Number(f[campo]);
    celdas[f.dia_semana][f.hora] += v;
    total += v;
    const c = celdas[f.dia_semana][f.hora];
    if (c > max) { max = c; mejor = { dia: f.dia_semana, hora: f.hora, valor: c }; }
    if (v > 0) { hMin = Math.min(hMin, f.hora); hMax = Math.max(hMax, f.hora); }
  }
  if (hMax < 0) { hMin = 9; hMax = 20; }
  let horaMin = Math.max(0, hMin - 1), horaMax = Math.min(23, hMax + 1);
  while (horaMax - horaMin < 7) { if (horaMin > 0) horaMin--; if (horaMax < 23 && horaMax - horaMin < 7) horaMax++; }
  return { celdas, max, total, mejor, horaMin, horaMax };
}

export function textoMejorHorario(m: Calor["mejor"]): string {
  return m ? `${DIAS_LARGO[m.dia]} a las ${m.hora} h` : "Sin datos todavía";
}

// ---------- Recurrencia de clientes ----------
export interface Recurrencia { conCliente: number; recurrentes: number; pctVuelven: number; intervalo: number | null; dormidos: number }

export function resumenRecurrencia(f: FilaRecurrencia | undefined | null): Recurrencia {
  const conCliente = Number(f?.con_cliente ?? 0), recurrentes = Number(f?.recurrentes ?? 0);
  const intervalo = f?.intervalo_dias === null || f?.intervalo_dias === undefined ? null : Number(f.intervalo_dias);
  return { conCliente, recurrentes, pctVuelven: conCliente > 0 ? Math.round((recurrentes / conCliente) * 100) : 0, intervalo, dormidos: Number(f?.dormidos ?? 0) };
}

// ---------- Rentabilidad y desempeño ----------
export function margenPct(vendido: number, local: number): number {
  return vendido > 0 ? Math.round((local / vendido) * 100) : 0;
}

export interface Desempeno { cortes: number; diasConVentas: number; cortesPorDia: number; ticket: number; mejorHora: number | null }

export function desempeno(serie: FilaDia[], horas: FilaHora[]): Desempeno {
  const cortes = serie.reduce((s, f) => s + f.cantidad, 0);
  const vendido = serie.reduce((s, f) => s + f.vendido, 0);
  const diasConVentas = serie.filter((f) => f.cantidad > 0).length;
  const mejor = horas.reduce<FilaHora | null>((m, h) => (!m || h.cantidad > m.cantidad ? h : m), null);
  return {
    cortes, diasConVentas, cortesPorDia: diasConVentas > 0 ? Math.round((cortes / diasConVentas) * 10) / 10 : 0,
    ticket: cortes > 0 ? Math.round(vendido / cortes) : 0, mejorHora: mejor && mejor.cantidad > 0 ? mejor.hora : null,
  };
}
