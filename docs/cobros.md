# Cobros por día (migración 16)

Reemplaza la "Caja" (conteo de efectivo + liquidación por rango de fechas) por un acuerdo simple entre barbero y dueño.

- **Barbero**: ve cuánto hizo hoy y ayer, y por mes (‹ mes ›). Elige uno o varios días y toca **Pedir cobro**.
- **Dueño / encargado**: ve los **pedidos para decidir** (widget de Inicio + pestaña Resumen > Cobros), **Acepta** o **Rechaza** (con motivo). También puede marcar cobrado un día que nadie pidió.
- Aceptado = "Lunes cobrado". Rechazado: el barbero ve el motivo y puede volver a pedir.
- La app solo **registra** el cobro, no mueve plata.
- Un punto rojo avisa: al dueño, pedidos sin decidir; al barbero, decisiones nuevas desde la última vez que miró.

## Reglas
- Solo cuentan ventas válidas con comisión por porcentaje (alquiler de silla y sueldo fijo no tienen comisión que cobrar).
- Se puede pedir hoy y hasta 90 días atrás; no días futuros ni sin comisión.
- **Solo el dueño anula ventas.** Si anula una venta de un día ya cobrado, el cobro no se toca: la diferencia queda como *ajuste* y se descuenta en el próximo cobro (nunca se entrega menos de 0; el resto sigue pendiente). Una venta cargada tarde en un día cobrado suma al próximo cobro.
- Las liquidaciones y cierres de caja viejos siguen guardados (tablas `settlements` y `cash_closings`); las liquidaciones se ven en "Liquidaciones anteriores".

## Base de datos
`supabase/migrations/20261102000016_cobros_por_dia.sql`: tabla `payout_days` (solo se escribe por función), `request_payout`, `decide_payout`, `dias_cobro`, `ajuste_cobros`, y `cancel_sale` ahora solo para OWNER.
Tests: `supabase/tests/rls_cobros_test.sql` (`supabase/tests/correr_tests.sh rls_cobros_test.sql`).

## Mirar meses pasados
Panorama, Ventas y Gastos tienen ‹ › y, en Mes/Año, una lista para saltar (hasta 36 meses / 5 años). Un mes pasado se ve completo y se compara contra el mes anterior completo.
