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

## Diseño visual (Etapa E3)
- Tema claro cálido por defecto (oscuro opcional por dispositivo). Superficies de "vidrio líquido" definidas al final de `globals.css` (tarjetas translúcidas, brillo en el borde, esferas de color, botones de tinta en píldora). `--acento-vivo` es decorativo; `--acento` se usa para texto.
- Inicio incluye el widget "Tu impulso" (`src/lib/impulso.ts`): meta, ritmo diario, mejor día de los últimos 90.
- Marca propia: Ajustes → Mi barbería (nombre, dirección, logo). Migración 11 + Worker `worker/index.js` + `src/lib/manifest.ts`. Migraciones pendientes de aplicar por Maro: 9, 10 y 11.

## Modo demo (para diseñar sin base de datos, p. ej. en Modeinspect)
- Si faltan `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`, la app NO muestra el cartel de "sin configurar": se abre con una barbería inventada ("Black Label Barbershop"), usuario dueño ya logueado y datos de ejemplo (ventas de 120 días, turnos, gastos, caja, clientes, metas). Todo vive en memoria: al recargar vuelve al inicio.
- Código: `src/lib/demo/datos.ts` (datos) y `src/lib/demo/cliente.ts` (imita lo que la app usa de Supabase: from/select/filtros, rpc, auth, storage). Se conecta en `src/lib/supabase.ts` (`modoDemo()`).
- Solo se activa fuera de producción (`next dev`) o con `NEXT_PUBLIC_MODO_DEMO=1`. En producción real (variables cargadas, `.env.production`) nunca se activa. `.env.production` NO se lee en `next dev`; por eso Modeinspect no veía las variables.
- Si se agrega una función `rpc` o una tabla nueva que las pantallas lean, hay que sumarla también al cliente demo (si no, la pantalla se ve vacía en la demo); `src/lib/demo/cliente.test.ts` cubre lo principal.
