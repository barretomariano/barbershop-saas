# Base de datos (Supabase)

- `migrations/`: cambios de esquema, en orden. Se aplican en el SQL Editor de Supabase.
- `tests/`: pruebas de seguridad. `00_simular_supabase.sql` y `rls_test.sql` son SOLO para un Postgres local; no se ejecutan en Supabase.

## Crear el primer negocio (piloto)
1. En Supabase: Authentication → Users → Add user (email del dueño). Copiá su UUID.
2. En el SQL Editor ejecutá, con tus datos:
   select private.admin_create_business('Nombre de la barbería', 'UUID-DEL-DUEÑO', 'Nombre del dueño');
