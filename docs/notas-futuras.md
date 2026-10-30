# Notas para más adelante

## Caja como nexo entre el cobro del jefe al barbero y la app del barbero (pedido del dueño, 29 oct 2026)
Idea: que Caja sea el punto donde se registra lo que el jefe le paga al barbero (liquidaciones de comisión)
y que eso se refleje en la versión de la app que ve el barbero (lo que ya le pagaron, lo que le falta cobrar,
historial de pagos). Hoy existen la liquidación (`settle_commissions`) y el widget "Tu comisión por cobrar".
Pendiente de diseñar con el dueño: qué ve el barbero, si confirma que recibió el pago, y cómo se relaciona con
el cierre diario. No implementar sin su aprobación.

## Pendiente de verificar en navegador real
La app se sirve en `/b/<dirección>/` con el HTML de la raíz. Si Next muestra un 404 o parpadea al hidratar en esa ruta,
plan B: que el Worker inyecte `history.replaceState(null, "", "/")` antes de que arranque la app y guardar la marca en localStorage.
