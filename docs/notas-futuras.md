# Notas para más adelante

## Caja como nexo entre el cobro del jefe al barbero y la app del barbero (pedido del dueño, 29 oct 2026)
Idea: que Caja sea el punto donde se registra lo que el jefe le paga al barbero (liquidaciones de comisión)
y que eso se refleje en la versión de la app que ve el barbero (lo que ya le pagaron, lo que le falta cobrar,
historial de pagos). Hoy existen la liquidación (`settle_commissions`) y el widget "Tu comisión por cobrar".
Pendiente de diseñar con el dueño: qué ve el barbero, si confirma que recibió el pago, y cómo se relaciona con
el cierre diario. No implementar sin su aprobación.

## Pantallas que todavía tienen formularios en línea (pasarlos a modal)
Presupuestos, gastos recurrentes y proveedores (`GastosAvanzados.tsx`), Metas, Horarios y Módulos (`AjustesNegocio.tsx`).
