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
Etapa 4 (pantallas): ingreso con email y contraseña, cargar ventas, resumen por período y ajustes (servicios y comisiones). Compila y pasa lint y tests, pero NO se probó contra el Supabase real todavía. Pendiente: variables de entorno, hosting para verla online, login con Google, pruebas con el piloto.
