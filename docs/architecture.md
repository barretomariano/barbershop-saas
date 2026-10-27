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

## Ventas y comisiones
Estado: IMPLEMENTADO en `supabase/migrations/20261025000002_ventas_y_comisiones.sql`. Verificado en Postgres local (30 chequeos en `supabase/tests/rls_ventas_test.sql`). NO verificado todavía sobre Supabase real.
- Las ventas se crean solo con `register_sale` y se anulan solo con `cancel_sale`. No hay insert, update ni delete directo.
- Cálculo en la base. Modelos por barbero: PERCENT (porcentaje de cada venta), CHAIR_RENT (el barbero se queda con el 100%; el alquiler fijo se contabiliza aparte, PLANIFICADO) y SALARY (0% por venta; sueldo aparte, PLANIFICADO).
- Cada venta guarda una copia del modelo y porcentaje usados; cambiar la comisión no altera ventas anteriores.
- Redondeo al peso entero: barbero = redondeo(monto x %), local = resto, la suma siempre cierra.
- Anti-duplicados: cada venta lleva una clave única (`idempotency_key`); repetirla devuelve la misma venta.
- Anulación: solo OWNER/MANAGER, con motivo. Una venta anulada no se reactiva.
- Un barbero solo registra y ve sus propias ventas. OWNER y MANAGER ven todas las del negocio.
- Un barbero no puede vender hasta que el OWNER configure su comisión.
- Pendiente: montos de alquiler de silla y sueldos, totales por período, gastos.

## Suscripción
`businesses.subscription_status` existe (trialing, active, suspended, canceled) pero todavía no se aplica en ninguna regla.

## Pantallas (Etapa 4)
Estado: escritas; compilan, pasan lint, tipos y tests de lógica (formato de montos, porcentajes, períodos en hora argentina). NO probadas contra el Supabase real ni en un navegador.
- Ingreso por email y contraseña (Supabase Auth). Login con Google: PLANIFICADO.
- Vender: servicio, monto, medio de pago, barbero (encargado/dueño). Clave anti-duplicado por intento.
- Resumen: hoy, últimos 7 días y este mes. El barbero ve lo suyo; dueño y encargado ven todo. Anular con motivo.
- Ajustes: servicios (dueño y encargado) y comisión por barbero (solo dueño).
- Los permisos reales los aplica la base (RLS); las pantallas solo ocultan lo que el usuario no puede usar.
- Los totales mostrados se suman en el navegador a partir de montos ya calculados por la base. El cálculo de comisión nunca se hace en el navegador.
- Límite actual: se muestran hasta 500 ventas por período.

## Gastos (Etapa 5)
Estado: IMPLEMENTADO en `supabase/migrations/20261027000003_gastos.sql`. Verificado en Postgres local (21 chequeos en `supabase/tests/rls_gastos_test.sql`). NO verificado todavía sobre Supabase real.
- Categorías: alquiler, servicios, insumos, sueldos, impuestos, otros. Montos en ARS enteros.
- Solo OWNER y MANAGER ven, cargan y anulan gastos; un BARBER no los ve.
- Se registran con `register_expense` y se anulan con `cancel_expense` (con motivo). No se editan ni se borran. Clave anti-duplicado igual que en ventas.
- La pantalla muestra "queda en el local" = parte del local en ventas del período − gastos válidos (suma de valores ya calculados por la base).
- Pendiente: montos fijos de alquiler de silla y sueldos por barbero.

## Publicación
Exportación estática (`output: "export"`) + Cloudflare Pages. PWA: `public/manifest.webmanifest` y `public/sw.js` (no guarda datos de Supabase).
