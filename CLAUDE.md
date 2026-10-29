# Reglas del proyecto

## Qué es
SaaS multi-tenant de gestión financiera para barberías en Argentina: registrar ventas en ~10 segundos, calcular comisiones barbero/local, ver resúmenes por rol. Tiene módulos opcionales que el dueño enciende o apaga: agenda de turnos y clientes (ver docs/planes.md).

## Stack decidido (no cambiar sin explicar el motivo)
Next.js + TypeScript (App Router), Tailwind, shadcn/ui, Supabase (Postgres, Auth con Google, RLS), Cloudflare, Vitest + Playwright, Zod.

## Reglas duras
- Todo registro de un negocio lleva `business_id`; el aislamiento se garantiza con RLS en la base, no solo en el frontend.
- Los cálculos de dinero y los permisos se hacen en servidor/base de datos, nunca se confía en valores del navegador.
- Montos en ARS como enteros. Interfaz en español argentino.
- Roles por negocio: OWNER, MANAGER, BARBER.
- Sin secretos en el repo. `.env.example` va con valores vacíos. Excepción aprobada por el dueño: `.env.production` tiene solo la URL y la clave PUBLISHABLE de Supabase (públicas por diseño) para que Cloudflare compile sin configurar variables. La clave `service_role` nunca va al repo ni al navegador.
- No activar planes pagos, dominios ni facturación sin aprobación explícita del dueño del proyecto.
- No declarar algo como terminado sin haberlo ejecutado y verificado.
- Permisos de escritura permitidos, merge y push al main branch.
- Verificar siempre que la lógica no se rompa, chequear interpolaciones de funciones para que no se superpongan ni se pisen entre sí.
- Proactividad.

## Comandos
`npm run dev`, `npm run lint`, `npm run test`, `npm run build`, `npm run typecheck`

## Etapa actual
Etapa D casi completa: módulos, planes y widgets, agenda, clientes, metas, caja y cierre diario, liquidación de comisiones, gastos recurrentes, proveedores, presupuestos con alertas, reportes y auditoría (migraciones 6, 7 y 8).
Verificado por el dueño en el Supabase real y en navegador (según su nota): lo hecho hasta la migración 7 y probado con el primer cliente.
Verificado por Claude solo en local: lint, tipos, 89 tests de lógica, build y 315 chequeos de seguridad SQL en Postgres local (incluye la migración 8).
NO verificado todavía: la migración 8 y sus pantallas (Caja, Reportes, proveedores, recurrentes, presupuestos, auditoría) contra el Supabase real ni en navegador. Pendiente: diseño y experiencia de usuario, sucursales y permisos configurables (plan Avanzado) y restricciones por plan (ver docs/planes.md).
