# Reglas del proyecto

## Qué es
SaaS multi-tenant de gestión financiera para barberías en Argentina: registrar ventas en ~10 segundos, calcular comisiones barbero/local, ver resúmenes por rol. NO es app de turnos.

## Stack decidido (no cambiar sin explicar el motivo)
Next.js + TypeScript (App Router), Tailwind, shadcn/ui, Supabase (Postgres, Auth con Google, RLS), Vercel o alternativa verificada, Vitest + Playwright, Zod.

## Reglas duras
- Todo registro de un negocio lleva `business_id`; el aislamiento se garantiza con RLS en la base, no solo en el frontend.
- Los cálculos de dinero y los permisos se hacen en servidor/base de datos, nunca se confía en valores del navegador.
- Montos en ARS como enteros. Interfaz en español argentino.
- Roles por negocio: OWNER, MANAGER, BARBER.
- Sin secretos en el repo. Solo `.env.example` con valores vacíos. La clave `service_role` nunca llega al navegador.
- No activar planes pagos, dominios ni facturación sin aprobación explícita del dueño del proyecto.
- No declarar algo como terminado sin haberlo ejecutado y verificado.
- No force-push, no borrar datos ni repos sin aprobación.

## Comandos
`npm run dev`, `npm run lint`, `npm run test`, `npm run build`, `npm run typecheck`

## Etapa actual
Etapa 5: app completa para el primer cliente. Incluye ingreso con email y contraseña, ventas, resumen, gastos (solo dueño y encargado), ajustes (servicios y comisiones), PWA instalable y publicación estática para Cloudflare (`output: "export"`, ver `docs/publicar-en-cloudflare.md`).
Verificado: lint, tipos, tests de lógica y build; 68 chequeos de seguridad SQL en Postgres local (17 + 30 + 21).
NO verificado todavía: contra el Supabase real ni en un navegador. Pendiente: aplicar la migración 3 en Supabase, publicar en Cloudflare, login con Google, pruebas con el primer cliente.
