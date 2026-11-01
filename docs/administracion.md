# Administración de barberías (guía de Maro)

Todo esto se hace en **Supabase → SQL Editor**. Pegás una línea, apretás Run, y listo. No hay que tocar código.

## 1. Dar de alta una barbería nueva (3 pasos, ~5 minutos)

**Paso 1 – Crear el usuario del dueño.** Supabase → *Authentication → Users → Add user → Create new user*. Poné el email del dueño y una contraseña provisoria (que después cambia él). Tildá *Auto Confirm User*.

**Paso 2 – Crear la barbería.** En el SQL Editor:

```sql
select private.admin_alta('Nombre de la barbería', 'email-del-dueno@gmail.com', 'Nombre del dueño');
```

Si todo sale bien responde: `Listo: "Nombre…" creada…`. Si algo falta, el error te dice qué (por ejemplo, que el email no existe todavía).

**Paso 3 – Pasarle el acceso al dueño.** Mandale por WhatsApp el link de la app, su email y la contraseña provisoria. Al entrar por primera vez la app lo lleva sola a elegir sus **colores** y sus **módulos**. Desde ahí él carga sus servicios, su equipo y sus comisiones en *Ajustes*.

> Cada barbería queda totalmente separada: nadie ve los datos de otra.

## 2. Ver cómo está cada barbería (tu control mensual)

```sql
select * from private.admin_negocios();
```

Una fila por barbería: si está **ACTIVA** o **PAUSADA**, el email del dueño, cuántas personas tiene activas, cuántas ventas cargó en los últimos 30 días y cuándo fue la última. Sirve para dos cosas: ver quién **no pagó** (a quien cobrás por fuera) y ver quién **no la está usando** (para llamarlo y ayudarlo).

## 3. Pausar a quien no pagó

```sql
select private.admin_pausar('Nombre exacto de la barbería', 'No pagó noviembre');
```

- Todo el equipo de esa barbería deja de poder entrar. Al abrir la app ven **“Cuenta pausada”** con un botón a tu WhatsApp de soporte.
- **No se borra nada.** Ventas, turnos, clientes y configuración quedan guardados.
- El texto entre comillas es una nota solo para vos (aparece en `admin_negocios()`).

## 4. Reanudar cuando paga

```sql
select private.admin_reanudar('Nombre exacto de la barbería');
```

Vuelve el acceso de todos los que estaban activos al pausar, con todos sus datos. Los empleados que ya estaban dados de baja de antes **no** se reactivan.

> El nombre puede ir en minúsculas, pero tiene que ser el mismo que en `admin_negocios()`. Si hay dos barberías con el mismo nombre, el sistema avisa y no hace nada.

## 5. Rutina mensual sugerida (5 minutos)

1. Cobrás por fuera (transferencia / Mercado Pago).
2. Corrés `select * from private.admin_negocios();`.
3. A quien no pagó: `admin_pausar` (podés avisarle antes por WhatsApp).
4. A quien pagó y estaba pausado: `admin_reanudar`.

## Soporte por WhatsApp en la app

Para que la pantalla “Cuenta pausada” muestre el botón de WhatsApp, cargá la variable `NEXT_PUBLIC_SOPORTE_WHATSAPP` (solo dígitos con código de país, ej. `5491112345678`) en Cloudflare → *Workers & Pages → tu proyecto → Settings → Variables and secrets*, como variable **de compilación** (Build), y volvé a desplegar. Sin la variable, la app funciona igual pero sin el botón.

## El ping de GitHub (para que Supabase no pause tu base)

En el plan gratis de Supabase la base se pausa sola si pasa una semana sin actividad. El archivo `.github/workflows/mantener-activo.yml` llama cada 2 días a una función mínima (`ping`) y lo evita. No tenés que hacer nada, salvo:
- Aplicar la migración 15 (crea la función `ping`).
- Una vez: GitHub → pestaña **Actions** → “Mantener activa la base” → **Run workflow**, para confirmar que da verde.
- Si algún día queda en rojo: abrí Supabase y fijate si el proyecto está pausado (botón *Restore*).
- GitHub puede apagar los workflows programados si el repositorio pasa 60 días sin ningún cambio; si pasa, entrás a Actions y lo volvés a activar con un clic.

## Backups mientras estés en el plan gratis

El plan gratis **no hace backups automáticos**. Mientras tanto: una vez por semana, Supabase → *Database → Backups* o, mejor, bajá un respaldo con `pg_dump` (te lo armo cuando quieras). Cuando haya ganancia, el plan Pro (US$ 25/mes) trae backups diarios.
