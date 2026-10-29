-- Etapa E: color de énfasis del negocio.
-- El dueño elige un color de una paleta cerrada (la lista debe coincidir con ACENTOS en src/lib/tema.ts).
-- Se guarda en el negocio para que todo el equipo vea la misma identidad.

alter table public.businesses
  add column if not exists accent text not null default 'brasa'
  check (accent in ('brasa', 'ambar', 'jade', 'cobalto', 'lila', 'granate'));

-- Hasta ahora solo se podía editar el nombre; se suma el color. La política de UPDATE ya limita la edición al dueño.
grant update (accent) on public.businesses to authenticated;
