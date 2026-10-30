// Cliente "falso" de Supabase para el MODO DEMO. Imita lo justo de la API real (from/select/filtros, rpc, auth,
// storage, functions) leyendo y escribiendo en memoria. Sirve para ver y diseñar la app sin base de datos.
import { hoyAR } from "@/lib/periodos";
import { crearTablas, DEMO_NEGOCIO_ID, DEMO_USER_ID, type Fila, type Tablas } from "./datos";

const OFFSET_AR = -3 * 3_600_000;
type Resp = { data: unknown; error: { message: string } | null; count?: number | null };
type Pred = (f: Fila) => boolean;

let tablas: Tablas | null = null;
function db(): Tablas {
  if (!tablas) tablas = crearTablas();
  return tablas;
}
let contador = 0;
const nuevoId = (p: string) => `${p}-demo-${Date.now().toString(36)}-${++contador}`;

// ---- Comparaciones y filtros -------------------------------------------------------------------------------
function comparar(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a ?? ""), y = String(b ?? "");
  return x < y ? -1 : x > y ? 1 : 0;
}
function aValor(txt: string): unknown {
  return txt === "null" ? null : txt === "true" ? true : txt === "false" ? false : txt;
}
function predicado(col: string, op: string, v: unknown): Pred {
  switch (op) {
    case "eq": return (f) => (f[col] ?? null) === v || String(f[col]) === String(v);
    case "neq": return (f) => String(f[col]) !== String(v);
    case "gt": return (f) => comparar(f[col], v) > 0;
    case "gte": return (f) => comparar(f[col], v) >= 0;
    case "lt": return (f) => comparar(f[col], v) < 0;
    case "lte": return (f) => comparar(f[col], v) <= 0;
    case "is": return (f) => (f[col] ?? null) === v;
    default: return () => true;
  }
}
// Parte por comas que no estén dentro de paréntesis.
function partirTope(s: string): string[] {
  const out: string[] = []; let nivel = 0; let actual = "";
  for (const c of s) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) { out.push(actual); actual = ""; } else actual += c;
  }
  if (actual) out.push(actual);
  return out;
}
// Soporta el formato de PostgREST usado por la app: "a.eq.X,and(b.eq.Y,c.lte.Z)".
function predicadoOr(expr: string): Pred {
  const hijos = partirTope(expr).map((parte): Pred => {
    if (parte.startsWith("and(") && parte.endsWith(")")) {
      const todos = partirTope(parte.slice(4, -1)).map(predicadoOr);
      return (f) => todos.every((p) => p(f));
    }
    const i = parte.indexOf("."), j = parte.indexOf(".", i + 1);
    return predicado(parte.slice(0, i), parte.slice(i + 1, j), aValor(parte.slice(j + 1)));
  });
  return (f) => hijos.some((p) => p(f));
}

// ---- Consulta encadenable (se resuelve al hacer await) ------------------------------------------------------
class Consulta implements PromiseLike<Resp> {
  private filtros: Pred[] = [];
  private orden: { col: string; asc: boolean } | null = null;
  private tope: number | null = null;
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private cuerpo: Fila | Fila[] | null = null;
  private soloCuenta = false;
  private conteo = false;
  private unico: "single" | "maybe" | null = null;
  constructor(private tabla: string) {}

  select(_cols?: string, op?: { count?: string; head?: boolean }) {
    if (op?.count) this.conteo = true;
    if (op?.head) this.soloCuenta = true;
    return this;
  }
  insert(c: Fila | Fila[]) { this.modo = "insert"; this.cuerpo = c; return this; }
  update(c: Fila) { this.modo = "update"; this.cuerpo = c; return this; }
  delete() { this.modo = "delete"; return this; }
  eq(c: string, v: unknown) { this.filtros.push(predicado(c, "eq", v)); return this; }
  neq(c: string, v: unknown) { this.filtros.push(predicado(c, "neq", v)); return this; }
  gt(c: string, v: unknown) { this.filtros.push(predicado(c, "gt", v)); return this; }
  gte(c: string, v: unknown) { this.filtros.push(predicado(c, "gte", v)); return this; }
  lt(c: string, v: unknown) { this.filtros.push(predicado(c, "lt", v)); return this; }
  lte(c: string, v: unknown) { this.filtros.push(predicado(c, "lte", v)); return this; }
  is(c: string, v: unknown) { this.filtros.push(predicado(c, "is", v)); return this; }
  in(c: string, vs: unknown[]) { this.filtros.push((f) => vs.map(String).includes(String(f[c]))); return this; }
  or(expr: string) { this.filtros.push(predicadoOr(expr)); return this; }
  order(col: string, op?: { ascending?: boolean }) { this.orden = { col, asc: op?.ascending !== false }; return this; }
  limit(n: number) { this.tope = n; return this; }
  single() { this.unico = "single"; return this; }
  maybeSingle() { this.unico = "maybe"; return this; }

  private ejecutar(): Resp {
    const filas = (db()[this.tabla] ??= []);
    const coincide = (f: Fila) => this.filtros.every((p) => p(f));

    if (this.modo === "insert") {
      const lista = (Array.isArray(this.cuerpo) ? this.cuerpo : [this.cuerpo ?? {}]).map((c) => ({
        id: nuevoId(this.tabla), business_id: DEMO_NEGOCIO_ID, active: true, created_at: new Date().toISOString(), ...c,
      }));
      filas.push(...lista);
      return { data: lista, error: null };
    }
    if (this.modo === "update") {
      const tocadas = filas.filter(coincide);
      for (const f of tocadas) Object.assign(f, this.cuerpo);
      return { data: tocadas, error: null };
    }
    if (this.modo === "delete") {
      const borradas = filas.filter(coincide);
      db()[this.tabla] = filas.filter((f) => !coincide(f));
      return { data: borradas, error: null };
    }

    let r = filas.filter(coincide);
    if (this.orden) {
      const { col, asc } = this.orden;
      r = [...r].sort((a, b) => (asc ? 1 : -1) * comparar(a[col], b[col]));
    }
    const total = r.length;
    if (this.tope !== null) r = r.slice(0, this.tope);
    // Los turnos traen a su cliente embebido ("*, clients(name,phone)").
    let salida: Fila[] = r;
    if (this.tabla === "appointments") {
      salida = r.map((t) => {
        const c = db().clients.find((x) => x.id === t.client_id);
        return { ...t, clients: c ? { name: c.name, phone: c.phone ?? null } : null };
      });
    }
    if (this.soloCuenta) return { data: null, error: null, count: total };
    if (this.unico) {
      if (salida.length === 0 && this.unico === "single") return { data: null, error: { message: "No se encontró el registro." } };
      return { data: salida[0] ?? null, error: null };
    }
    return { data: salida, error: null, count: this.conteo ? total : undefined };
  }

  then<A = Resp, B = never>(ok?: ((v: Resp) => A | PromiseLike<A>) | null, no?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.ejecutar()).then(ok, no);
  }
}

// ---- Funciones (rpc) --------------------------------------------------------------------------------------
type Args = Record<string, unknown>;
const ventasValidas = (a: Args) => db().sales.filter((v) => v.status === "VALID" && String(v.sold_at) >= String(a.p_desde) && String(v.sold_at) < String(a.p_hasta));
const gastosValidos = (a: Args) => db().expenses.filter((g) => g.status === "VALID" && String(g.spent_at) >= String(a.p_desde) && String(g.spent_at) < String(a.p_hasta));
const suma = (xs: Fila[], k: string) => xs.reduce((s, x) => s + Number(x[k] ?? 0), 0);
function agrupar(xs: Fila[], clave: (f: Fila) => string): Map<string, Fila[]> {
  const m = new Map<string, Fila[]>();
  for (const x of xs) { const k = clave(x); m.set(k, [...(m.get(k) ?? []), x]); }
  return m;
}
const diaAR = (iso: string) => hoyAR(new Date(iso));
const horaAR = (iso: string) => new Date(new Date(iso).getTime() + OFFSET_AR).getUTCHours();

function comisionDe(m: Fila, monto: number) {
  const modelo = m.commission_model as string, bps = Number(m.commission_bps);
  const barbero = modelo === "PERCENT" ? Math.round((monto * bps) / 10000) : modelo === "CHAIR_RENT" ? monto : 0;
  return { commission_model: modelo, commission_bps: bps, barber_amount: barbero, local_amount: monto - barbero };
}
function registrarVenta(a: { barbero: string; monto: number; medio: string; servicio?: string | null; cliente?: string | null; nota?: string | null }): string {
  const m = db().memberships.find((x) => x.id === a.barbero) ?? db().memberships[0];
  const s = db().services.find((x) => x.id === a.servicio);
  const id = nuevoId("v");
  db().sales.push({
    id, business_id: DEMO_NEGOCIO_ID, barber_membership_id: m.id, service_id: s?.id ?? null, service_name: s?.name ?? null,
    client_id: a.cliente ?? null, amount: a.monto, payment_method: a.medio, sold_at: new Date().toISOString(),
    ...comisionDe(m, a.monto), status: "VALID", cancel_reason: null, note: a.nota ?? null,
  });
  return id;
}

function rpc(nombre: string, a: Args): Resp {
  const ok = (data: unknown = null): Resp => ({ data, error: null });
  switch (nombre) {
    case "resumen_ventas": {
      const filas: Fila[] = [];
      for (const [, g] of agrupar(ventasValidas(a), (v) => `${v.barber_membership_id}|${v.payment_method}`)) {
        filas.push({ barber_membership_id: g[0].barber_membership_id, payment_method: g[0].payment_method, cantidad: g.length, vendido: suma(g, "amount"), para_barbero: suma(g, "barber_amount"), para_local: suma(g, "local_amount") });
      }
      return ok(filas);
    }
    case "resumen_gastos": {
      return ok([...agrupar(gastosValidos(a), (g) => String(g.category))].map(([category, g]) => ({ category, cantidad: g.length, total: suma(g, "amount") })));
    }
    case "resumen_por_servicio": {
      const filas = [...agrupar(ventasValidas(a), (v) => String(v.service_name ?? "Sin servicio"))]
        .map(([service_name, g]) => ({ service_name, cantidad: g.length, vendido: suma(g, "amount") }))
        .sort((x, y) => y.vendido - x.vendido);
      return ok(filas);
    }
    case "serie_diaria": {
      return ok([...agrupar(ventasValidas(a), (v) => diaAR(String(v.sold_at)))]
        .map(([dia, g]) => ({ dia, cantidad: g.length, vendido: suma(g, "amount"), para_local: suma(g, "local_amount") }))
        .sort((x, y) => x.dia.localeCompare(y.dia)));
    }
    case "ventas_por_hora": {
      return ok([...agrupar(ventasValidas(a), (v) => String(horaAR(String(v.sold_at))))]
        .map(([h, g]) => ({ hora: Number(h), cantidad: g.length, vendido: suma(g, "amount") }))
        .sort((x, y) => x.hora - y.hora));
    }
    case "top_clientes": {
      const conCliente = ventasValidas(a).filter((v) => v.client_id);
      return ok([...agrupar(conCliente, (v) => String(v.client_id))]
        .map(([client_id, g]) => ({ client_id, nombre: String(db().clients.find((c) => c.id === client_id)?.name ?? "Cliente"), visitas: g.length, gastado: suma(g, "amount") }))
        .sort((x, y) => y.gastado - x.gastado).slice(0, Number(a.p_limite ?? 5)));
    }
    case "fijos_mensuales": {
      const activos = db().memberships.filter((m) => m.active);
      return ok([{
        alquiler_silla: suma(activos.filter((m) => m.commission_model === "CHAIR_RENT"), "fixed_monthly"),
        sueldos: suma(activos.filter((m) => m.commission_model === "SALARY"), "fixed_monthly"),
      }]);
    }
    case "pendiente_liquidacion": {
      const desde = new Date(Date.now() - 15 * 86_400_000).toISOString();
      const hasta = new Date(`${String(a.p_upto)}T23:59:59-03:00`).toISOString();
      const validas = db().sales.filter((v) => v.status === "VALID" && String(v.sold_at) >= desde && String(v.sold_at) <= hasta);
      return ok(db().memberships.filter((m) => m.commission_model === "PERCENT" && m.role === "BARBER").map((m) => {
        const g = validas.filter((v) => v.barber_membership_id === m.id);
        return { barber_membership_id: m.id, cantidad: g.length, vendido: suma(g, "amount"), a_pagar: suma(g, "barber_amount") };
      }).filter((f) => f.cantidad > 0));
    }
    case "register_sale":
      return ok(registrarVenta({ barbero: String(a.p_barber_membership), monto: Number(a.p_amount), medio: String(a.p_payment), servicio: a.p_service as string | null, cliente: a.p_client as string | null, nota: a.p_note as string | null }));
    case "register_expense":
      db().expenses.push({ id: nuevoId("g"), business_id: DEMO_NEGOCIO_ID, category: a.p_category, description: a.p_description ?? null, amount: Number(a.p_amount), spent_at: new Date().toISOString(), status: "VALID", cancel_reason: null, supplier_id: a.p_supplier ?? null });
      return ok();
    case "cancel_sale": {
      const v = db().sales.find((x) => x.id === a.p_sale);
      if (v) { v.status = "CANCELED"; v.cancel_reason = String(a.p_reason ?? ""); }
      return ok();
    }
    case "cancel_expense": {
      const g = db().expenses.find((x) => x.id === a.p_expense);
      if (g) { g.status = "CANCELED"; g.cancel_reason = String(a.p_reason ?? ""); }
      return ok();
    }
    case "create_appointment": {
      const s = db().services.find((x) => x.id === a.p_service);
      const ini = new Date(String(a.p_starts_at)).getTime();
      const dur = Number(a.p_duration_minutes ?? s?.duration_minutes ?? 30);
      db().appointments.push({
        id: nuevoId("t"), business_id: DEMO_NEGOCIO_ID, barber_membership_id: a.p_barber_membership, client_id: a.p_client ?? null, client_name: a.p_client_name ?? null,
        service_id: s?.id ?? null, service_name: s?.name ?? null, starts_at: new Date(ini).toISOString(), ends_at: new Date(ini + dur * 60_000).toISOString(),
        status: "SCHEDULED", note: a.p_note ?? null, sale_id: null, cancel_reason: null,
      });
      return ok();
    }
    case "update_appointment": {
      const t = db().appointments.find((x) => x.id === a.p_appointment);
      if (t) {
        const s = db().services.find((x) => x.id === a.p_service);
        const ini = new Date(String(a.p_starts_at)).getTime();
        Object.assign(t, { barber_membership_id: a.p_barber_membership, client_id: a.p_client ?? null, client_name: a.p_client_name ?? null, service_id: s?.id ?? null, service_name: s?.name ?? null, note: a.p_note ?? null, starts_at: new Date(ini).toISOString(), ends_at: new Date(ini + Number(a.p_duration_minutes ?? 30) * 60_000).toISOString() });
      }
      return ok();
    }
    case "charge_appointment": {
      const t = db().appointments.find((x) => x.id === a.p_appointment);
      if (t) { t.sale_id = registrarVenta({ barbero: String(t.barber_membership_id), monto: Number(a.p_amount), medio: String(a.p_payment), servicio: t.service_id as string | null, cliente: t.client_id as string | null }); t.status = "PAID"; }
      return ok();
    }
    case "save_modules": {
      const activos = (a.p_enabled as string[]) ?? [];
      for (const m of db().business_modules) m.enabled = activos.includes(String(m.module));
      if (a.p_finish_setup) Object.assign(db().businesses[0], { setup_completed_at: new Date().toISOString() });
      return ok();
    }
    case "set_goal": {
      const fila = db().sales_goals.find((g) => g.month === a.p_month && (g.barber_membership_id ?? null) === (a.p_membership ?? null));
      if (fila) fila.amount = Number(a.p_amount);
      else db().sales_goals.push({ id: nuevoId("sg"), business_id: DEMO_NEGOCIO_ID, barber_membership_id: a.p_membership ?? null, month: a.p_month, amount: Number(a.p_amount) });
      return ok();
    }
    case "set_budget": {
      const fila = db().budgets.find((g) => g.month === a.p_month && g.category === a.p_category);
      if (fila) fila.amount = Number(a.p_amount);
      else db().budgets.push({ id: nuevoId("b"), business_id: DEMO_NEGOCIO_ID, category: a.p_category, month: a.p_month, amount: Number(a.p_amount) });
      return ok();
    }
    case "save_working_hours": {
      db().working_hours = db().working_hours.filter((h) => h.membership_id !== a.p_membership);
      for (const h of (a.p_hours as { weekday: number; start: string; end: string }[]) ?? []) {
        db().working_hours.push({ id: nuevoId("wh"), membership_id: a.p_membership, weekday: h.weekday, start_time: `${h.start}:00`.slice(0, 8), end_time: `${h.end}:00`.slice(0, 8) });
      }
      return ok();
    }
    case "set_branding":
      Object.assign(db().businesses[0], { name: a.p_name ?? db().businesses[0].name, slug: a.p_slug ?? null });
      return ok();
    case "close_day": {
      const dia = String(a.p_date);
      const delDia = db().sales.filter((v) => v.status === "VALID" && diaAR(String(v.sold_at)) === dia);
      const porMedio: Record<string, number> = {};
      for (const v of delDia) porMedio[String(v.payment_method)] = (porMedio[String(v.payment_method)] ?? 0) + Number(v.amount);
      const esperado = porMedio.EFECTIVO ?? 0;
      db().cash_closings.push({ id: nuevoId("cc"), business_id: DEMO_NEGOCIO_ID, closing_date: dia, expected_cash: esperado, counted_cash: Number(a.p_counted), difference: Number(a.p_counted) - esperado, sales_count: delDia.length, sales_total: suma(delDia, "amount"), expenses_total: 0, by_method: porMedio, note: a.p_note ?? null });
      return ok();
    }
    case "settle_commissions":
      db().settlements.push({ id: nuevoId("st"), business_id: DEMO_NEGOCIO_ID, barber_membership_id: a.p_membership, upto: a.p_upto, sales_count: 0, sales_total: 0, amount: 0, note: a.p_note ?? null, created_at: new Date().toISOString() });
      return ok();
    case "generate_recurring_expenses":
      return ok(0);
    default:
      return ok(); // set_logo y demás: sin efecto en la demo
  }
}

// ---- Cliente completo ---------------------------------------------------------------------------------------
const SESION = {
  access_token: "demo", refresh_token: "demo", expires_in: 3600, expires_at: 4102444800, token_type: "bearer",
  user: { id: DEMO_USER_ID, email: "demo@barberia.local", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

export function crearClienteDemo() {
  return {
    from: (tabla: string) => new Consulta(tabla),
    rpc: (nombre: string, args: Args = {}) => Promise.resolve(rpc(nombre, args)),
    auth: {
      getSession: () => Promise.resolve({ data: { session: SESION }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: null }),
      signInWithPassword: () => Promise.resolve({ data: { session: SESION }, error: null }),
      resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
    },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: {}, error: null }), remove: () => Promise.resolve({ data: [], error: null }) }) },
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
  };
}
