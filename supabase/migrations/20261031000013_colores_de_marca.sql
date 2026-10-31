-- Etapa 1 del rediseño: dos colores de marca libres por barbería (principal y secundario).
-- Reemplazan a la paleta cerrada de `accent` (migración 9), que queda en la tabla sin usarse para no romper nada.
-- Se guardan como #RRGGBB en mayúsculas; la app calcula el contraste y el texto legible de cada color.

alter table public.businesses
  add column if not exists primary_color text
    check (primary_color is null or primary_color ~ '^#[0-9A-F]{6}$'),
  add column if not exists secondary_color text
    check (secondary_color is null or secondary_color ~ '^#[0-9A-F]{6}$');

-- Las barberías que ya habían elegido un color de la paleta vieja conservan su identidad (mismo par de colores).
update public.businesses set
  primary_color = case accent
    when 'brasa' then '#FF7A3D' when 'ambar' then '#F5B83D' when 'jade' then '#34C796'
    when 'cobalto' then '#5B8CFF' when 'lila' then '#A08CFF' when 'granate' then '#F0575C' end,
  secondary_color = case accent
    when 'brasa' then '#3E63FF' when 'ambar' then '#E5484D' when 'jade' then '#3E63FF'
    when 'cobalto' then '#FF8A5B' when 'lila' then '#FF7AA8' when 'granate' then '#F5B83D' end
where primary_color is null and accent is not null;

-- Igual que `accent`: la política de UPDATE de businesses ya limita la edición al dueño.
grant update (primary_color, secondary_color) on public.businesses to authenticated;
