# Planes y módulos

El plan es una etiqueta comercial guardada en `businesses.plan` (BASICO, INTERMEDIO, AVANZADO). **Todavía no restringe nada**: hoy cada módulo se enciende o apaga por negocio (`save_modules`). Decisión pendiente del dueño del proyecto: si las funciones de cada plan se bloquean (por ejemplo, agenda solo desde Intermedio) o si todos los planes pueden usar todo y solo cambian otros límites. Cuando se decida, se bloquea con una regla en `save_modules` y en `module_enabled`.

## Qué incluye cada plan (definición comercial) y estado

| Plan | Función | Estado |
|---|---|---|
| Básico | Ventas, medios de pago, gastos, resumen financiero | Hecho |
| Básico | Empleados y comisiones, historial y anulaciones | Hecho |
| Básico | Resumen por día, semana y mes (y año) | Hecho |
| Intermedio | Agenda de turnos | Hecho (módulo AGENDA) |
| Intermedio | Fichas e historial de clientes | Hecho (módulo CLIENTES) |
| Intermedio | Caja y cierre diario | Pendiente |
| Intermedio | Liquidación de comisiones | Pendiente |
| Intermedio | Gastos recurrentes, proveedores, reportes avanzados | Pendiente |
| Avanzado | Múltiples sucursales, permisos por empleado | Pendiente |
| Avanzado | Presupuestos y alertas, auditoría, rentabilidad por sucursal | Pendiente |

## Reglas de la agenda
- Turnos en bloques de 15 minutos; un barbero no puede tener dos turnos programados superpuestos.
- Estados: programado, terminado (falta cobrar), cobrado, cancelado, no vino.
- Terminar un turno nunca crea una venta: hay que cobrarlo confirmando monto y medio de pago.
- Un turno programado cuya hora de fin ya pasó cuenta como "por cerrar", igual que uno terminado sin cobrar.
- Horarios de trabajo por persona: si no tiene ninguno cargado, no hay restricción.

## Ganancia en el inicio
- Bruta = todo lo vendido. Neta = parte del local − gastos. En el período "Este mes" también se suman los alquileres de silla y se restan los sueldos fijos del mes.
