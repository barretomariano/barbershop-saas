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
- Estilo: tokens CSS en `globals.css` (oscuro por defecto, claro opcional por dispositivo). Cada barbería elige DOS colores libres (principal y secundario) en el setup (paso 1) y en Ajustes > Apariencia; se guardan en `businesses.primary_color/secondary_color` (migración 13; `accent` de la migración 9 queda sin uso). `src/lib/tema.ts` calcula las variables CSS y garantiza contraste con cualquier color. No usar colores sueltos ni emojis; usar solo las variables: `--acento-vivo` + `--sobre-vivo` (relleno sólido del principal y su texto), `--acento` (principal como texto), `--par-vivo` + `--sobre-par` y `--par` (secundario como relleno / trazo), `--tinta` (cápsulas y botones oscuros) y los íconos de `components/ui.tsx`.
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

## Rediseño por etapas (31 oct 2026, referencia: tablero fintech con cápsulas)
- Tema: Claro (arena fundida en degradado con el color principal, `--fondo-claro`), Oscuro (negro AMOLED #000, sin degradados) o Automático (sigue al celular). Preferencia por dispositivo en `barberia.tema`.
- Etapa 1 (hecha, migración 13): colores libres + motor de temas + AMOLED.
- Etapas 2 a 5 (hechas, migración 14): sistema de cápsulas y gráficos, Inicio y Resumen rediseñados, vistas por rol, resto de pantallas en el mismo estilo.
  - `components/capsulas.tsx`: `Tarjeta` (tono `neutra` | `color` | `tinta`), `Barra`, `BarraMeta`, `useRpc`. Máximo 1 o 2 cápsulas sólidas por pantalla: Ventas = `color`, Ganancia = `tinta`; todo lo demás neutro y mate (sin grano ni vidrio; el esmerilado queda solo en cabecera y barra inferior).
  - `components/graficos.tsx`: `GraficoArea` (actual en principal, anterior punteado en secundario), `BarrasDobles`, `MapaCalor` (día × hora), `TiraMeses`. SVG/CSS propio, sin librerías.
  - `components/widgetsVisuales.tsx`: widgets que piden sus propios datos: `resumen_mes`, `tendencia`, `horarios`, `recurrencia`, `rentabilidad`, `flujo`, `desempeno` (solo barbero). Se registran en `lib/widgets.ts` (catálogo, por rol y módulo) y en `VISUALES` de `Tablero.tsx`.
  - `lib/series.ts`: lógica pura y testeada (plan de cada período con su anterior alineado, tira de meses, matriz de calor, recurrencia, rendimiento). No usar `Date.now()` en el render (regla de lint): calcular rangos con `hoyAR()` y `rangoDia()`.
  - Migración 14 (verificada en un Postgres real): `mapa_calor`, `recurrencia_clientes`, `serie_gastos`, `rentabilidad_servicios`; todas `security invoker` (el barbero solo ve lo suyo). El modo demo las implementa en `lib/demo/cliente.ts`.
  - Reportes usa los mismos gráficos. Resumen > Ventas abre con cápsula de color.
- Verificado: tipos, lint, 187 tests y build. Pendiente: revisión visual en navegador (no hay navegador en el entorno de Claude).

## Agenda, pausa de cuentas y administración (1 nov 2026, migración 15)
- Agenda: abre en Calendario con el día elegido debajo (sin pestañas Día/Calendario). Tocar el mes o el año abre un selector; cada día se pinta según cuántos turnos tiene (`nivelCarga` en `lib/calendario.ts`, relativo al día más cargado del mes, con tope mínimo de 6). El botón flotante "Turno" vive en `page.tsx` y solo aparece en Agenda (`mostrarBotonTurno`); `Agenda` abre el formulario cuando cambia `abrirNuevo`.
- Quién ve qué en la agenda (RLS, migración 7): el barbero solo ve sus turnos; dueño y encargado ven todos. Dueño/encargado tienen filtro por barbero (chips con la cuenta del día) y el día se agrupa por barbero o por hora.
- Pausa por falta de pago (migración 15): `private.admin_pausar/admin_reanudar` apagan y reencienden `memberships.active` (marcando `paused_off`), así toda regla de seguridad existente bloquea el acceso sin tocar datos. La app muestra "Cuenta pausada" usando `public.estado_de_mi_cuenta()` y el botón de WhatsApp de `lib/soporte.ts` (variable `NEXT_PUBLIC_SOPORTE_WHATSAPP`). Alta: `private.admin_alta(nombre, email, nombre_dueño)`. Control: `private.admin_negocios()`. Guía: `docs/administracion.md`.
- `.github/workflows/mantener-activo.yml` llama a `public.ping()` cada 2 días para que Supabase gratis no se pause.
- Legal: borradores en `public/terminos.html` y `public/privacidad.html` (con campos [entre corchetes] por completar; aún sin enlazar desde la app) y revisión en `docs/revision-legal.md`.
- Pruebas SQL: `supabase/tests/*.sql` (11 archivos, 356 verificaciones) contra Postgres 16 real con `00_simular_supabase.sql`; la 15 tiene `rls_pausa_test.sql`.
- Ajustes → Ayuda (todos los roles): `components/Ayuda.tsx`, botón verde "Contactar a soporte por WhatsApp" (clase `.boton-whatsapp`, mismo estilo en la pantalla "Cuenta pausada"). Usa `NEXT_PUBLIC_SOPORTE_WHATSAPP`; sin número, la sección avisa que no hay contacto disponible.
