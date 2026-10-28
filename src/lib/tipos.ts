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
}

export interface Servicio {
  id: string;
  business_id: string;
  name: string;
  default_price: number;
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
