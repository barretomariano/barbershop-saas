-- Etapa C: usuario de acceso para el equipo.
-- Los barberos y encargados entran con "usuario y clave" (sin email propio). El sistema les
-- crea un acceso interno y guarda acá el usuario para mostrarlo en la pantalla Equipo.
-- Solo lo escribe la función segura del servidor (gestionar-equipo): el navegador no puede
-- ponerlo ni cambiarlo (no se otorgan permisos de escritura sobre esta columna).
-- No modifica datos existentes: las personas ya cargadas quedan con username vacío.

alter table public.memberships
  add column username text
  check (username is null or username ~ '^[a-z0-9._-]{3,30}$');

-- Un usuario es único en todo el sistema (es lo que se escribe para entrar).
create unique index memberships_username_uidx
  on public.memberships (username) where username is not null;
