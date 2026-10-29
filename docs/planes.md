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
| Intermedio | Caja y cierre diario | Hecho (pestaña Caja) |
| Intermedio | Liquidación de comisiones | Hecho (pestaña Caja; solo ventas con comisión por porcentaje) |
| Intermedio | Gastos recurrentes, proveedores, reportes avanzados | Hecho (Gastos y Reportes) |
| Avanzado | Múltiples sucursales | Pendiente (cambio de estructura grande: cada dato pasaría a pertenecer a una sucursal) |
| Avanzado | Permisos configurables por empleado | Pendiente |
| Avanzado | Presupuestos y alertas | Hecho (presupuesto por categoría y widget de alertas) |
| Avanzado | Auditoría de cambios | Hecho (Ajustes, solo dueño) |
| Avanzado | Rentabilidad por sucursal | Pendiente (depende de sucursales) |

## Reglas de la agenda
- Turnos en bloques de 15 minutos; un barbero no puede tener dos turnos programados superpuestos.
- Estados: programado, terminado (falta cobrar), cobrado, cancelado, no vino.
- Terminar un turno nunca crea una venta: hay que cobrarlo confirmando monto y medio de pago.
- Un turno programado cuya hora de fin ya pasó cuenta como "por cerrar", igual que uno terminado sin cobrar.
- Horarios de trabajo por persona: si no tiene ninguno cargado, no hay restricción.

## Ganancia en el inicio
- Bruta = todo lo vendido. Neta = parte del local − gastos. En el período "Este mes" también se suman los alquileres de silla y se restan los sueldos fijos del mes.

## Reglas de caja, liquidación y auditoría
- Cierre de caja: el efectivo esperado es lo cobrado en efectivo ese día (ventas válidas). Se guarda la diferencia con lo contado. Un día se cierra una sola vez y no se edita. Solo se pueden cerrar los últimos 30 días.
- Liquidación: solo ventas con comisión por porcentaje. Cada venta se liquida una sola vez y una venta liquidada no se puede anular.
- Gastos recurrentes: se generan una vez por mes en el mes en curso (no recuperan meses anteriores) y nunca se duplican.
- Auditoría: la escribe solo la base; solo el dueño la lee; no se edita ni se borra.
