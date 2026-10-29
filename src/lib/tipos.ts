export type Rol = "OWNER" | "MANAGER" | "BARBER";
export type ModeloComision = "PERCENT" | "CHAIR_RENT" | "SALARY";
export type MedioPago = "EFECTIVO" | "TRANSFERENCIA" | "DEBITO" | "CREDITO" | "MERCADO_PAGO";

export const MEDIOS_PAGO: { valor: MedioPago; etiqueta: string }[] = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "DEBITO", etiqueta: "Débito" },
  { valor: "CREDITO", etiqueta: "Crédito" },
  { valor: "MERCADO_PAGO", etiqueta: "Mercado Pago" },
];

export interface Membresia {
  id: string;
  business_id: string;
  user_id: string;
  role: Rol;
  display_name: string;
  active: boolean;
  commission_model: ModeloComision;
  commission_bps: number;
  commission_configured: boolean;
  fixed_monthly: number;
}

export interface Servicio {
  id: string;
  business_id: string;
  name: string;
  default_price: number;
  duration_minutes: number;
  active: boolean;
}

export interface Venta {
  id: string;
  barber_membership_id: string;
  service_name: string | null;
  amount: number;
  payment_method: MedioPago;
  sold_at: string;
  commission_model: ModeloComision;
  commission_bps: number;
  barber_amount: number;
  local_amount: number;
  status: "VALID" | "CANCELED";
  cancel_reason: string | null;
}

export type CategoriaGasto = "ALQUILER" | "SERVICIOS" | "INSUMOS" | "SUELDOS" | "IMPUESTOS" | "OTROS";

export const CATEGORIAS_GASTO: { valor: CategoriaGasto; etiqueta: string }[] = [
  { valor: "ALQUILER", etiqueta: "Alquiler" },
  { valor: "SERVICIOS", etiqueta: "Luz, agua, internet" },
  { valor: "INSUMOS", etiqueta: "Insumos" },
  { valor: "SUELDOS", etiqueta: "Sueldos" },
  { valor: "IMPUESTOS", etiqueta: "Impuestos" },
  { valor: "OTROS", etiqueta: "Otros" },
];

export interface Gasto {
  id: string;
  category: CategoriaGasto;
  description: string | null;
  amount: number;
  spent_at: string;
  status: "VALID" | "CANCELED";
  cancel_reason: string | null;
}

// Fila que devuelve resumen_ventas (los totales los calcula la base de datos).
export interface FilaResumenVentas {
  barber_membership_id: string;
  payment_method: MedioPago;
  cantidad: number;
  vendido: number;
  para_barbero: number;
  para_local: number;
}

// Fila que devuelve resumen_gastos.
export interface FilaResumenGastos {
  category: CategoriaGasto;
  cantidad: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Módulos, clientes, turnos, metas y horarios (Etapa D)
// ---------------------------------------------------------------------------
export type ModuloNegocio = "AGENDA" | "CLIENTES";
export type PlanNegocio = "BASICO" | "INTERMEDIO" | "AVANZADO";

export const MODULOS: { valor: ModuloNegocio; titulo: string; detalle: string }[] = [
  { valor: "AGENDA", titulo: "Agenda de turnos", detalle: "Turnos por barbero, con aviso de turnos por cobrar." },
  { valor: "CLIENTES", titulo: "Clientes", detalle: "Fichas con teléfono, notas e historial." },
];

export interface DatosNegocio {
  nombre: string;
  plan: PlanNegocio;
  configuracionTerminada: boolean;
  modulos: ModuloNegocio[]; // los que están encendidos
}

export interface Cliente {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
}

export type EstadoTurno = "SCHEDULED" | "DONE" | "PAID" | "CANCELED" | "NO_SHOW";

export interface Turno {
  id: string;
  barber_membership_id: string;
  client_id: string | null;
  client_name: string | null;
  service_id: string | null;
  service_name: string | null;
  starts_at: string;
  ends_at: string;
  status: EstadoTurno;
  note: string | null;
  sale_id: string | null;
  cancel_reason: string | null;
  clients: { name: string; phone: string | null } | null;
}

export interface Meta {
  barber_membership_id: string | null;
  month: string;
  amount: number;
}

export interface HorarioTrabajo {
  membership_id: string;
  weekday: number; // 1 = lunes ... 7 = domingo
  start_time: string; // "09:00:00"
  end_time: string;
}

export interface FilaResumenServicio {
  service_name: string;
  cantidad: number;
  vendido: number;
}

// ---------------------------------------------------------------------------
// Gestión avanzada (migración 8)
// ---------------------------------------------------------------------------
export interface Proveedor { id: string; business_id: string; name: string; phone: string | null; notes: string | null; active: boolean }

export interface GastoRecurrente {
  id: string; business_id: string; category: CategoriaGasto; description: string | null;
  amount: number; day_of_month: number; supplier_id: string | null; active: boolean;
}

export interface CierreCaja {
  id: string; closing_date: string; expected_cash: number; counted_cash: number; difference: number;
  sales_count: number; sales_total: number; expenses_total: number; by_method: Record<string, number>; note: string | null;
}

export interface Liquidacion {
  id: string; barber_membership_id: string; upto: string; sales_count: number; sales_total: number; amount: number;
  note: string | null; created_at: string;
}

export interface FilaPendiente { barber_membership_id: string; cantidad: number; vendido: number; a_pagar: number }
export interface Presupuesto { category: CategoriaGasto; month: string; amount: number }

export interface EntradaAuditoria {
  id: number; user_id: string | null; at: string; action: "INSERT" | "UPDATE" | "DELETE"; entity: string; entity_id: string | null;
  detail: Record<string, unknown>;
}

export interface FilaDia { dia: string; cantidad: number; vendido: number; para_local: number }
export interface FilaHora { hora: number; cantidad: number; vendido: number }
export interface FilaTopCliente { client_id: string; nombre: string; visitas: number; gastado: number }
