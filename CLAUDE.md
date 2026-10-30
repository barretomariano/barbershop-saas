# Reglas del proyecto

> Si sos otro agente (Codex u otro): leé también `AGENTS.md` y `docs/handoff-codex.md` antes de empezar.

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

## Diseño y experiencia (Etapa E)
- Navegación: 4 pestañas fijas abajo (Inicio, Agenda, Resumen, Ajustes). Agenda desaparece si el módulo está apagado (`src/lib/navegacion.ts`).
- El botón flotante de Nueva venta existe SOLO en Inicio. Nueva venta es un modal por pasos (`VentaModal` + `src/lib/venta.ts`): cada elección desbloquea la siguiente.
- Resumen reúne Panorama (bruto/neto/desglose), Ventas, Reportes, Caja y Gastos. Clientes, Servicios, Equipo, Comisiones, Horarios, Metas, Módulos, Apariencia e Historial viven en Ajustes.
- Inicio muestra solo lo del día a día (siempre HOY, sin selector de período). Resumen > Panorama es el tablero con selector de período. Ambos usan `Tablero.tsx` y `src/lib/widgets.ts`: widgets FIJOS (siempre visibles) y OPCIONALES (se suman desde "Más widgets", al final). Todo widget es clickeable y lleva a su detalle.
- Formularios y altas van en modales (`Hoja`, `Campo`, `Fichas`, `PieHoja` de `components/ui.tsx`), nunca en línea debajo de una lista.
- Agenda muestra también las ventas sueltas del día (las de turnos cobrados no se repiten) y permite editar turnos programados (migración 10, `update_appointment`).
- Estilo: tokens CSS en `globals.css` (oscuro por defecto, claro opcional por dispositivo). El dueño elige un color de énfasis de una paleta cerrada (`src/lib/tema.ts`, guardado en `businesses.accent`, migración 9). No usar colores sueltos ni emojis en la interfaz; usar `var(--acento)` y los íconos de `components/ui.tsx`.
- Tipografías propias (Instrument Sans y Bricolage Grotesque) autoalojadas con fontsource: no depender de Google Fonts.

## Etapa actual
Etapa E (diseño y experiencia) implementada en código. Migraciones 9 (color de énfasis) y 10 (editar turnos) pendientes de aplicar en Supabase; la 10 se probó en Postgres local con `supabase/tests/rls_editar_turnos_test.sql`. Sin la 9: sin ella la app funciona con el color por defecto y avisa al dueño al intentar cambiarlo.
Verificado por Claude solo en local: lint, tipos, tests de lógica y build. NO verificado: ninguna pantalla nueva en navegador ni contra el Supabase real, ni la migración 9 en Postgres.
Pendiente: sucursales y permisos configurables (plan Avanzado) y restricciones por plan (ver docs/planes.md).
