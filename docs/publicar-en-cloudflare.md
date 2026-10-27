# Publicar la app en Cloudflare (gratis)

La app se compila a archivos estáticos (carpeta `out/`). No necesita servidor propio: toda la seguridad la pone Supabase (RLS).
Los nombres de los botones de Cloudflare pueden variar levemente.

## Pasos
1. Entrar a https://dash.cloudflare.com con el email del proyecto.
2. **Workers & Pages** → **Create** → pestaña **Pages** → **Connect to Git** → autorizar GitHub → elegir `barbershop-saas`.
3. Configuración de build:
   - Production branch: `main`
   - Framework preset: `Next.js (Static HTML Export)` (o ninguno)
   - Build command: `npm run build`
   - Build output directory: `out`
4. En **Environment variables** (Production) cargar:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL de Supabase (Project Settings → API)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = clave `anon` / `publishable` (NUNCA la `service_role`)
   - `NODE_VERSION` = `22`
5. **Save and Deploy**. Al terminar, Cloudflare da una dirección `https://<nombre>.pages.dev`.
6. En Supabase: **Authentication → URL Configuration** → poner esa dirección en *Site URL* y en *Redirect URLs*.

## Cada vez que cambia `main`
Cloudflare vuelve a publicar solo.

## Instalar en el celular
Abrir la dirección en Chrome (Android) → menú ⋮ → *Instalar app* / *Agregar a pantalla de inicio*. En iPhone: Safari → Compartir → *Agregar a inicio*.
