# Traspaso a otro agente (29 oct 2026)

Escrito por Claude al terminar la Etapa E (diseño y experiencia). El dueño (Maro) sigue con otro agente por presupuesto y vuelve a Claude más adelante. Este archivo es la fuente de verdad del traspaso: **si algo de acá deja de ser cierto, actualizalo**.

## Estado en una frase
La Etapa E está implementada y subida a `main` (commit `9362fb8`). Pasa lint, tipos, 113 tests y build **en local**, pero **nadie la vio todavía en un navegador ni contra el Supabase real**.

## Lo primero que hay que hacer (en este orden)
1. **Pedirle al dueño que aplique la migración 9** (`supabase/migrations/20261029000009_color_de_enfasis.sql`) en el SQL Editor de Supabase. Sin ella la app anda igual (color por defecto) y avisa al dueño al intentar cambiar el color. Esa migración no se probó en Postgres (no había uno disponible).
2. **Confirmar con el dueño que la migración 8 también está aplicada** (Caja, Reportes, proveedores, recurrentes, presupuestos, auditoría). Sus pantallas nunca se verificaron contra el Supabase real.
3. **Prueba en navegador, en tamaño celular (390 px)**, con un dueño y con un barbero. Recorrer:
   - Login → las 4 pestañas (Agenda solo si el módulo está encendido; si se apaga, el tab desaparece y la app vuelve a Inicio).
   - Botón flotante "Nueva venta": solo en Inicio, nunca en otras pestañas.
   - Modal de venta: Servicio → Pago → Cliente → Nota → Registrar; volver a un paso ya hecho; "Otro monto"; monto con centavos (debe rechazarse); doble toque en Registrar (no debe duplicar); negocio sin clientes (se salta el paso) y sin servicios (pide monto).
   - Agenda: vista Día y Calendario; tocar un día; "Cobrar" abre el modal con el turno; terminar, no vino, cancelar.
   - Cada widget de Inicio lleva a donde dice (ver `Widget` en `src/components/Inicio.tsx`).
   - Resumen: Panorama, Ventas, Reportes, Caja, Gastos. Un barbero solo ve Panorama, Ventas y Reportes, con datos propios.
   - Ajustes: cada fila abre su sección y "‹ Ajustes" vuelve. Cambiar color (solo dueño) y tema.
   - Tema claro: revisar contraste en todas las pantallas.
4. **Arreglar lo que salga de esa prueba**, empezando por lo que impida registrar una venta.

## Lo que NO está verificado (no asumir que anda)
- Ninguna pantalla nueva en navegador (no hubo capturas ni Playwright).
- Pantallas viejas (Reportes, Caja, Gastos, Clientes, Equipo, Auditoría, Horarios, Metas, Módulos) solo se re-estilaron por herencia de tokens CSS y reemplazo de clases. Pueden tener espaciados, textos duplicados o contrastes raros en claro u oscuro. Revisarlas una por una.
- `Panorama` (bruto → neto) reutiliza las mismas RPC que el Inicio (`resumen_ventas`, `resumen_gastos`, `resumen_por_servicio`, `fijos_mensuales`). Cotejar sus números contra Reportes y Caja con datos reales.
- Las pruebas SQL de `supabase/tests/` no se corrieron en esta etapa (solo hay migración 9, trivial).
- Hidratación y parpadeo de tema al abrir la app (`SCRIPT_INICIAL` en `src/lib/tema.ts`).

## Mapa de lo que se hizo
| Qué | Dónde |
|---|---|
| Pestañas, permisos por rol/módulo, destinos | `src/lib/navegacion.ts` (+ test) |
| Shell, cabecera, barra inferior, botón flotante | `src/app/page.tsx` |
| Modal de nueva venta y lógica de pasos | `src/components/VentaModal.tsx`, `src/lib/venta.ts` (+ test) |
| Inicio con widgets clickeables | `src/components/Inicio.tsx`, `src/lib/widgets.ts` |
| Agenda (día + calendario) | `src/components/Agenda.tsx`, `src/lib/calendario.ts` (+ test), `src/lib/turnos.ts` |
| Resumen | `src/components/ResumenHub.tsx`, `Panorama.tsx`, y los viejos `Resumen`, `Reportes`, `Caja`, `Gastos` |
| Ajustes | `src/components/AjustesHub.tsx`, `Apariencia.tsx`, y secciones en `Ajustes.tsx`, `AjustesNegocio.tsx` |
| Tema y color de énfasis | `src/lib/tema.ts` (+ test de contraste), `src/app/globals.css`, `src/app/layout.tsx` |
| Primitivas (íconos, hoja/modal, segmentado) | `src/components/ui.tsx` |

## Trampas conocidas (leer antes de tocar)
- **Cobrar un turno NO usa `register_sale`**: usa la RPC `charge_appointment` (vincula la venta al turno). El modo "turno" de `VentaModal` solo pide medio de pago y monto. No unificar sin revisar la base.
- `register_sale` ya acepta `p_service`, `p_client` y `p_note`. La idempotencia depende de `p_idempotency_key`: la clave se regenera solo después de guardar (`otraVenta`). No cambiarla en cada render.
- **Color de énfasis**: la lista de `ACENTOS` en `src/lib/tema.ts` **debe coincidir** con el `check` de la migración 9. Si se agrega un color, va una migración nueva que reemplace el check. El color se lee en una consulta aparte en `page.tsx` a propósito: si la columna no existe, solo esa consulta falla y la app sigue. No mezclarla con la consulta principal de `businesses`.
- **CSS**: `globals.css` está fuera de las capas de Tailwind, así que **le gana a las utilidades de Tailwind**. Por eso `.tarjeta` no define `display` ni `gap` (se ponen con utilidades). Hay una regla global `* { border-color: var(--linea) }`. Los textos de error usan `text-red-600`, que está remapeado a `var(--peligro)`.
- **No usar colores sueltos ni emojis** en la interfaz: usar `var(--acento)`, `var(--tinta-acento)`, `var(--peligro)`, `var(--ok)` y los íconos de `ui.tsx`. El texto sobre el acento siempre va con `var(--tinta-acento)`.
- Tipografías: `@fontsource-variable/instrument-sans` y `bricolage-grotesque`, autoalojadas. **No** pasar a Google Fonts: Cloudflare compila sin red a esa fuente y la PWA debe andar sin conexión a terceros.
- Tras registrar una venta, `Panel` incrementa `refresco` y `Inicio`/`Agenda`/`ResumenHub` recargan. Si se agrega una pantalla con datos de ventas, engancharla a `refresco` o mostrará datos viejos.
- Resumen, Ajustes y Agenda se controlan con `ubicar()` (`navegacion.ts`): un destino no permitido cae en `panorama`/Ajustes/Inicio. Si agregás una sección, sumala ahí **y** al test.
- Nunca confiar en permisos del frontend: ocultar Caja/Gastos a un barbero es solo comodidad; la seguridad la dan las políticas RLS.

## Pendiente de producto (no empezar sin hablar con el dueño)
- **Restricciones por plan** (qué se bloquea en Básico/Intermedio/Avanzado): decisión del dueño, ver `docs/planes.md`.
- **Múltiples sucursales** y **rentabilidad por sucursal**: cambio de estructura grande (cada dato pasaría a pertenecer a una sucursal). Requiere diseño previo y migraciones con pruebas RLS.
- **Permisos configurables por empleado** (plan Avanzado).
- Planes pagos, dominios y facturación: **prohibido sin aprobación explícita del dueño**.

## Ideas de mejora que quedaron afuera de esta etapa
- Mejor feedback visual al registrar (hoy el inicio recarga con esqueleto).
- Reordenar widgets arrastrando (hoy es con flechas en la hoja "Editar").
- Pruebas de interfaz con Playwright (el stack lo prevé, todavía no hay ninguna).
- Actualizar `docs/architecture.md` con el nuevo mapa de navegación.

## Cómo trabajar
- Cambios chicos y verificables. Después de cada uno: `npm run lint && npm run typecheck && npm run test && npm run build`.
- Para la base: migración nueva con el siguiente número (`2026MMDD00000N_nombre.sql`), nunca editar las existentes, y agregar su prueba en `supabase/tests/` si toca RLS.
- Commits en español, descriptivos. Hay permiso para hacer push a `main`.
- Al terminar, actualizar la sección "Etapa actual" de `CLAUDE.md` con **lo que se verificó de verdad y lo que no**.
- Cuando el dueño vuelva a Claude, dejar acá abajo un registro corto de lo hecho.

## Registro
- 29 oct 2026 (Claude): Etapa E implementada y subida. Pendiente todo lo de "Lo primero que hay que hacer".
