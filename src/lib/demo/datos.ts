// Datos de ejemplo del MODO DEMO: una barbería inventada, generada al abrir la app (sin base de datos).
// Todo es ficticio y vive solo en la memoria del navegador: al recargar vuelve al estado inicial.
import { hoyAR } from "@/lib/periodos";

export type Fila = Record<string, unknown> & { id?: string | number };
export type Tablas = Record<string, Fila[]>;

export const DEMO_USER_ID = "demo-usuario-dueno";
export const DEMO_NEGOCIO_ID = "demo-negocio";

const MS_DIA = 86_400_000;
const OFFSET_AR = -3 * 3_600_000;

// Generador pseudoaleatorio con semilla fija: la demo siempre se ve igual.
function semilla(n: number) {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Instante UTC de "hora:minuto" argentinos del día (hoy + desfase de días).
function instante(ahora: number, dias: number, hora: number, minuto = 0): number {
  const local = ahora + OFFSET_AR;
  const dia0 = local - (((local % MS_DIA) + MS_DIA) % MS_DIA);
  return dia0 + dias * MS_DIA + (hora * 60 + minuto) * 60_000 - OFFSET_AR;
}

function diaSemanaAR(t: number): number {
  return new Date(t + OFFSET_AR).getUTCDay(); // 0 = domingo
}

export function crearTablas(ahora: number = Date.now()): Tablas {
  const azar = semilla(20261030);
  const entre = (a: number, b: number) => a + Math.floor(azar() * (b - a + 1));
  const elegir = <T,>(xs: T[]): T => xs[Math.floor(azar() * xs.length)];
  const iso = (t: number) => new Date(t).toISOString();
  let seq = 0;
  const id = (p: string) => `${p}-${++seq}`;
  const N = DEMO_NEGOCIO_ID;

  const memberships: Fila[] = [
    { id: "m-dueno", business_id: N, user_id: DEMO_USER_ID, role: "OWNER", display_name: "Nicolás Ferreyra", username: null, active: true, commission_model: "PERCENT", commission_bps: 4000, commission_configured: true, fixed_monthly: 0 },
    { id: "m-lucas", business_id: N, user_id: "demo-u-lucas", role: "BARBER", display_name: "Lucas Benítez", username: "lucas", active: true, commission_model: "PERCENT", commission_bps: 5000, commission_configured: true, fixed_monthly: 0 },
    { id: "m-tomas", business_id: N, user_id: "demo-u-tomas", role: "BARBER", display_name: "Tomás Aguirre", username: "tomas", active: true, commission_model: "PERCENT", commission_bps: 6000, commission_configured: true, fixed_monthly: 0 },
    { id: "m-franco", business_id: N, user_id: "demo-u-franco", role: "BARBER", display_name: "Franco Giménez", username: "franco", active: true, commission_model: "CHAIR_RENT", commission_bps: 0, commission_configured: true, fixed_monthly: 180000 },
    { id: "m-agustin", business_id: N, user_id: "demo-u-agustin", role: "BARBER", display_name: "Agustín Rojas", username: "agustin", active: true, commission_model: "SALARY", commission_bps: 0, commission_configured: true, fixed_monthly: 400000 },
  ];

  const services: Fila[] = [
    { id: "s-corte", business_id: N, name: "Corte clásico", default_price: 12000, duration_minutes: 30, active: true },
    { id: "s-degrade", business_id: N, name: "Degradé", default_price: 14000, duration_minutes: 40, active: true },
    { id: "s-cortebarba", business_id: N, name: "Corte + barba", default_price: 18000, duration_minutes: 45, active: true },
    { id: "s-barba", business_id: N, name: "Barba", default_price: 8000, duration_minutes: 20, active: true },
    { id: "s-cejas", business_id: N, name: "Perfilado de cejas", default_price: 4000, duration_minutes: 15, active: true },
    { id: "s-color", business_id: N, name: "Coloración", default_price: 30000, duration_minutes: 90, active: true },
  ];
  const pesoServicio = [30, 22, 22, 14, 7, 5];
  const servicioAzar = () => {
    let r = azar() * 100;
    for (let i = 0; i < services.length; i++) { r -= pesoServicio[i]; if (r <= 0) return services[i]; }
    return services[0];
  };

  const nombres = ["Matías Sosa", "Joaquín Paz", "Bruno Castro", "Santiago Ibarra", "Emiliano Vera", "Ignacio Luna", "Gonzalo Peralta", "Valentín Ríos", "Ramiro Acosta", "Lautaro Medina", "Federico Quiroga", "Dante Herrera"];
  const clients: Fila[] = nombres.map((name, i) => ({
    id: `c-${i + 1}`, business_id: N, name, phone: `11 ${entre(4000, 6999)}-${entre(1000, 9999)}`,
    notes: i === 0 ? "Prefiere la máquina en el 2 a los costados." : i === 3 ? "Siempre paga con transferencia." : null, active: true,
  }));

  const vendedores = memberships.filter((m) => m.id !== "m-dueno");
  const medios = ["EFECTIVO", "EFECTIVO", "EFECTIVO", "TRANSFERENCIA", "TRANSFERENCIA", "DEBITO", "DEBITO", "CREDITO", "MERCADO_PAGO", "MERCADO_PAGO"];

  const comision = (m: Fila, monto: number) => {
    const modelo = m.commission_model as string;
    const bps = Number(m.commission_bps);
    const barbero = modelo === "PERCENT" ? Math.round((monto * bps) / 10000) : modelo === "CHAIR_RENT" ? monto : 0;
    return { commission_model: modelo, commission_bps: bps, barber_amount: barbero, local_amount: monto - barbero };
  };

  // Ventas: últimos 120 días, de lunes a sábado.
  const sales: Fila[] = [];
  for (let d = -120; d <= 0; d++) {
    const base = instante(ahora, d, 12);
    if (diaSemanaAR(base) === 0) continue;
    const cantidad = diaSemanaAR(base) === 6 ? entre(11, 16) : entre(7, 12);
    for (let i = 0; i < cantidad; i++) {
      const t = instante(ahora, d, entre(10, 19), entre(0, 59));
      if (t > ahora - 10 * 60_000) continue;
      const m = azar() < 0.1 ? memberships[0] : elegir(vendedores);
      const s = servicioAzar();
      const monto = Number(s.default_price) + (azar() < 0.18 ? 1000 * entre(1, 3) : 0);
      const cliente = azar() < 0.55 ? elegir(clients) : null;
      const anulada = azar() < 0.02;
      sales.push({
        id: id("v"), business_id: N, barber_membership_id: m.id, service_id: s.id, service_name: s.name, client_id: cliente ? cliente.id : null,
        amount: monto, payment_method: elegir(medios), sold_at: iso(t), ...comision(m, monto),
        status: anulada ? "CANCELED" : "VALID", cancel_reason: anulada ? "Cargada dos veces" : null, note: null,
      });
    }
  }
  sales.sort((a, b) => String(a.sold_at).localeCompare(String(b.sold_at)));

  // Turnos: desde 3 días atrás hasta 6 días adelante.
  const appointments: Fila[] = [];
  for (let d = -3; d <= 6; d++) {
    const base = instante(ahora, d, 12);
    if (diaSemanaAR(base) === 0) continue;
    for (const m of vendedores.slice(0, 4)) {
      let hora = 10 + entre(0, 1);
      const cuantos = d === 0 ? 5 : entre(3, 5);
      for (let i = 0; i < cuantos && hora < 19; i++) {
        const s = servicioAzar();
        const ini = instante(ahora, d, hora, elegir([0, 30]));
        const fin = ini + Number(s.duration_minutes) * 60_000;
        const cliente = elegir(clients);
        const pasado = fin < ahora;
        let status = "SCHEDULED";
        if (pasado) status = azar() < 0.08 ? "NO_SHOW" : "PAID";
        appointments.push({
          id: id("t"), business_id: N, barber_membership_id: m.id, client_id: cliente.id, client_name: null, service_id: s.id, service_name: s.name,
          starts_at: iso(ini), ends_at: iso(fin), status, note: null, sale_id: null, cancel_reason: null,
        });
        hora += Math.ceil(Number(s.duration_minutes) / 60) + entre(0, 1);
      }
    }
  }
  // Para mostrar el aviso de "por cobrar": un turno terminado sin cobrar.
  const porCobrar = appointments.find((t) => t.status === "PAID" && new Date(String(t.ends_at)).getTime() > ahora - 36 * 3_600_000);
  if (porCobrar) porCobrar.status = "DONE";

  const expenses: Fila[] = [];
  for (let mes = -3; mes <= 0; mes++) {
    const l = new Date(ahora + OFFSET_AR);
    const y = l.getUTCFullYear();
    const m0 = l.getUTCMonth() + mes;
    const fijo = (dia: number, cat: string, desc: string, monto: number) => {
      const t = Date.UTC(y, m0, dia, 12) - OFFSET_AR;
      if (t < ahora) expenses.push({ id: id("g"), business_id: N, category: cat, description: desc, amount: monto, spent_at: iso(t), status: "VALID", cancel_reason: null, supplier_id: null });
    };
    fijo(5, "ALQUILER", "Alquiler del local", 650000);
    fijo(10, "SERVICIOS", "Luz y agua", 58000);
    fijo(12, "SERVICIOS", "Internet", 27000);
    fijo(15, "IMPUESTOS", "Monotributo", 45000);
    fijo(8, "INSUMOS", "Cuchillas y navajas", entre(40, 70) * 1000);
    fijo(20, "INSUMOS", "Productos para el cabello", entre(60, 120) * 1000);
    fijo(24, "OTROS", "Limpieza", entre(15, 30) * 1000);
  }
  expenses.sort((a, b) => String(a.spent_at).localeCompare(String(b.spent_at)));

  // Cierres de caja de los últimos días (ayer incluido).
  const cash_closings: Fila[] = [];
  for (let d = -6; d <= -1; d++) {
    const dia = hoyAR(new Date(instante(ahora, d, 12)));
    const delDia = sales.filter((v) => v.status === "VALID" && hoyAR(new Date(String(v.sold_at))) === dia);
    if (delDia.length === 0) continue;
    const porMedio: Record<string, number> = {};
    for (const v of delDia) porMedio[String(v.payment_method)] = (porMedio[String(v.payment_method)] ?? 0) + Number(v.amount);
    const esperado = porMedio.EFECTIVO ?? 0;
    const diferencia = azar() < 0.7 ? 0 : -entre(1, 3) * 500;
    cash_closings.push({
      id: id("cc"), business_id: N, closing_date: dia, expected_cash: esperado, counted_cash: esperado + diferencia, difference: diferencia,
      sales_count: delDia.length, sales_total: delDia.reduce((s, v) => s + Number(v.amount), 0), expenses_total: 0, by_method: porMedio, note: null,
    });
  }

  const mes = hoyAR(new Date(ahora)).slice(0, 8) + "01";
  const prov = (name: string, phone: string): Fila => ({ id: id("p"), business_id: N, name, phone, notes: null, active: true });
  const suppliers = [prov("Distribuidora Capelli", "11 5555-0142"), prov("Barber Supply Argentina", "11 5555-0187"), prov("Limpieza Don Pedro", "11 5555-0120")];

  return {
    memberships, services, clients, sales, appointments, expenses, cash_closings, suppliers,
    businesses: [{ id: N, name: "Black Label Barbershop", plan: "INTERMEDIO", setup_completed_at: iso(ahora - 30 * MS_DIA), accent: null, slug: "black-label", logo_version: 0 }],
    business_modules: [{ id: "bm-1", business_id: N, module: "AGENDA", enabled: true }, { id: "bm-2", business_id: N, module: "CLIENTES", enabled: true }],
    sales_goals: [{ id: "sg-1", business_id: N, barber_membership_id: null, month: mes, amount: 6500000 }, { id: "sg-2", business_id: N, barber_membership_id: "m-lucas", month: mes, amount: 1800000 }],
    budgets: [
      { id: "b-1", business_id: N, category: "ALQUILER", month: mes, amount: 650000 },
      { id: "b-2", business_id: N, category: "INSUMOS", month: mes, amount: 150000 },
      { id: "b-3", business_id: N, category: "SERVICIOS", month: mes, amount: 100000 },
    ],
    recurring_expenses: [
      { id: "r-1", business_id: N, category: "ALQUILER", description: "Alquiler del local", amount: 650000, day_of_month: 5, supplier_id: null, active: true },
      { id: "r-2", business_id: N, category: "SERVICIOS", description: "Internet", amount: 27000, day_of_month: 12, supplier_id: null, active: true },
    ],
    working_hours: memberships.flatMap((m) => [1, 2, 3, 4, 5, 6].map((weekday) => ({ id: `wh-${m.id}-${weekday}`, membership_id: m.id, weekday, start_time: "10:00:00", end_time: weekday === 6 ? "18:00:00" : "20:00:00" }))),
    settlements: [
      { id: "st-1", business_id: N, barber_membership_id: "m-lucas", upto: hoyAR(new Date(ahora - 14 * MS_DIA)), sales_count: 61, sales_total: 912000, amount: 456000, note: null, created_at: iso(ahora - 14 * MS_DIA) },
      { id: "st-2", business_id: N, barber_membership_id: "m-tomas", upto: hoyAR(new Date(ahora - 14 * MS_DIA)), sales_count: 58, sales_total: 874000, amount: 524400, note: null, created_at: iso(ahora - 14 * MS_DIA) },
    ],
    audit_log: [
      { id: 3, business_id: N, user_id: DEMO_USER_ID, at: iso(ahora - 2 * 3_600_000), action: "INSERT", entity: "sales", entity_id: "v-demo", detail: { amount: 18000 } },
      { id: 2, business_id: N, user_id: DEMO_USER_ID, at: iso(ahora - 26 * 3_600_000), action: "UPDATE", entity: "services", entity_id: "s-corte", detail: { default_price: 12000 } },
      { id: 1, business_id: N, user_id: DEMO_USER_ID, at: iso(ahora - 50 * 3_600_000), action: "INSERT", entity: "cash_closings", entity_id: "cc-demo", detail: {} },
    ],
    user_widgets: [],
  };
}
