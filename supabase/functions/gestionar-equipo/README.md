# gestionar-equipo (función segura del servidor)

Permite al **dueño** crear accesos (usuario y clave) para barberos y encargados, restablecer claves,
desactivar y reactivar personas. Es un solo archivo (`index.ts`), sin librerías externas.

## Instalación (una sola vez, sin instalar nada en tu computadora)
1. Aplicar la migración `migrations/20261028000005_usuario_de_equipo.sql` en Supabase → SQL Editor.
2. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
3. Nombre exacto: `gestionar-equipo`. Borrar el código de ejemplo y pegar **todo** el contenido de `index.ts`.
4. **Deploy**. No hace falta configurar variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las pone Supabase.

## Si algo falla
- "Invalid JWT" al usarla: en la función, desactivar la opción "Verify JWT" (el código ya valida la sesión por su cuenta).
- "Supabase no aceptó el dominio interno": crear el secreto `EMAIL_DOMAIN` (Edge Functions → Secrets) con un dominio
  propio, y el mismo valor en `NEXT_PUBLIC_DOMINIO_USUARIOS` al publicar la app. Por defecto es `equipo.invalid`.

## Reglas
- Solo un OWNER activo del negocio puede usarla; actúa solo sobre BARBER/MANAGER del mismo negocio.
- Restablecer clave solo funciona con cuentas creadas desde acá (tienen `username`).
- Las claves no se guardan ni se pueden ver: se muestran una sola vez.
- Pruebas: `index.test.ts` (corren con `npm test`, con un Supabase simulado).
