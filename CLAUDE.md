# Reglas del proyecto

## Qué es
SaaS multi-tenant de gestión financiera para barberías en Argentina: registrar ventas en ~10 segundos, calcular comisiones barbero/local, ver resúmenes por rol. Tiene módulos opcionales que el dueño enciende o apaga: agenda de turnos y clientes (ver docs/planes.md).

## Stack decidido (no cambiar sin explicar el motivo)
Next.js + TypeScript (App Router), Tailwind, shadcn/ui, Supabase (Postgres, Auth con Google, RLS), Vercel o alternativa verificada, Vitest + Playwright, Zod.

## Reglas duras
- Todo registro de un negocio lleva `business_id`; el aislamiento se garantiza con RLS en la base, no solo en el frontend.
- Los cálculos de dinero y los permisos se hacen en servidor/base de datos, nunca se confía en valores del navegador.
- Montos en ARS como enteros. Interfaz en español argentino.
- Roles por negocio: OWNER, MANAGER, BARBER.
- Sin secretos en el repo. `.env.example` va con valores vacíos. Excepción aprobada por el dueño: `.env.production` tiene solo la URL y la clave PUBLISHABLE de Supabase (públicas por diseño) para que Cloudflare compile sin configurar variables. La clave `service_role` nunca va al repo ni al navegador.
- No activar planes pagos, dominios ni facturación sin aprobación explícita del dueño del proyecto.
- No declarar algo como terminado sin haberlo ejecutado y verificado.
- No force-push, no borrar datos ni repos sin aprobación.

## Comandos
`npm run dev`, `npm run lint`, `npm run test`, `npm run build`, `npm run typecheck`

## Etapa actual
Etapa D: módulos, planes y widgets. Hecho: puesta en marcha del dueño, módulos AGENDA y CLIENTES, agenda con turnos por cobrar, clientes, metas, horarios, alquiler de silla y sueldos fijos, inicio con widgets, recuperar contraseña (migraciones 6 y 7).
Verificado: lint, tipos, 80 tests de lógica, build, y en Postgres local 232 chequeos de seguridad SQL (147 de etapas anteriores + 85 de agenda, clientes y metas).
NO verificado todavía: contra el Supabase real ni en un navegador. Pendiente: aplicar la migración 7 en Supabase, publicar en Cloudflare, probar con el primer cliente, diseño y experiencia de usuario, restricciones por plan (ver docs/planes.md).
