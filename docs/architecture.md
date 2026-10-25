# Arquitectura (borrador)

> Estado: PLANIFICADO. Nada de lo siguiente está implementado todavía.

## Aislamiento entre negocios (PLANIFICADO)
Una sola base compartida. Cada tabla de negocio tiene `business_id`. Las políticas RLS de Postgres permiten acceder solo a filas de negocios donde el usuario tiene una membresía.

## Roles (PLANIFICADO)
OWNER, MANAGER y BARBER, definidos en una tabla de membresías por negocio. Un barbero solo ve su propia información.

## Cálculo financiero (PLANIFICADO)
Comisión y totales se calculan en el servidor. Cada venta guarda una copia (snapshot) de la tasa aplicada, para que cambios futuros no reescriban el historial.
