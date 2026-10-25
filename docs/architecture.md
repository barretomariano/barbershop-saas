# Arquitectura

## Aislamiento entre negocios
Una sola base compartida. `businesses` es el tenant; `memberships` une usuarios con negocios y un rol.
Las políticas RLS de Postgres solo permiten acceder a filas de negocios donde el usuario tiene una membresía activa.
Las funciones `private.is_member` y `private.has_role` sirven de base a todas las políticas futuras.

Estado: IMPLEMENTADO en `supabase/migrations/20261025000001_negocios_y_membresias.sql`.
Verificado en un Postgres local con autenticación simulada (17 chequeos en `supabase/tests/rls_test.sql`).
NO verificado todavía sobre el proyecto real de Supabase.

## Roles
- OWNER: administra el negocio y su equipo.
- MANAGER: ve el equipo; no agrega ni modifica miembros.
- BARBER: ve solo su propia membresía.
Un negocio nunca puede quedarse sin OWNER activo. Las membresías no se borran: se desactivan.

## Alta de negocios
No hay registro público. Un negocio se crea manualmente con `private.admin_create_business(...)` desde el SQL Editor de Supabase.
Un usuario que inicia sesión sin membresía no ve ningún dato.

## Cálculo financiero
PLANIFICADO (Etapa 3). Comisión y totales se calcularán en el servidor y cada venta guardará una copia de la tasa aplicada.

## Suscripción
`businesses.subscription_status` existe (trialing, active, suspended, canceled) pero todavía no se aplica en ninguna regla.
