# Base de datos (Supabase)

- `migrations/`: cambios de esquema, en orden. Se aplican en el SQL Editor de Supabase.
- `tests/`: pruebas de seguridad. `00_simular_supabase.sql` y `rls_test.sql` son SOLO para un Postgres local; no se ejecutan en Supabase.

## Administración (alta, pausa, control)
Guía paso a paso en `docs/administracion.md`. Resumen, todo en el SQL Editor de Supabase:
- Alta: crear el usuario en Authentication → Users y después `select private.admin_alta('Nombre', 'email-del-dueno', 'Nombre del dueño');`
- Control: `select * from private.admin_negocios();`
- Pausar sin borrar nada: `select private.admin_pausar('Nombre exacto', 'nota');` — reanudar: `select private.admin_reanudar('Nombre exacto');`
