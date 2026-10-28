-- Etapa D (parte 1): plan comercial, módulos activables, puesta en marcha y widgets del inicio.
-- - Ventas, comisiones y gastos son el núcleo: siempre disponibles, no son módulos.
-- - Módulos opcionales que el dueño enciende o apaga: AGENDA (turnos) y CLIENTES (fichas).
-- - El plan (BASICO, INTERMEDIO, AVANZADO) queda guardado como etiqueta comercial; por ahora NO
--   restringe nada (los límites de cada plan están por definir).
-- - Solo el dueño cambia módulos, y solo con la función save_modules (el navegador no escribe directo).
-- - Cada persona guarda la disposición de sus widgets del inicio (solo la suya).

create type public.business_module as enum ('AGENDA', 'CLIENTES');
create type public.business_plan as enum ('BASICO', 'INTERMEDIO', 'AVANZADO');

alter table public.businesses
  add column plan public.business_plan not null default 'BASICO',
  add column setup_completed_at timestamptz;

-- Los negocios ya creados quedan sin la puesta en marcha hecha: el dueño la verá la próxima vez que entre.

create table public.business_modules (
  business_id uuid not null references public.businesses(id) on delete restrict,
  module public.business_module not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (business_id, module)
);

alter table public.business_modules enable row level security;
alter table public.business_modules force row level security;
revoke all on public.business_modules from anon, authenticated;
grant select on public.business_modules to authenticated;

-- Todos los miembros del negocio ven qué módulos están activos (para mostrar u ocultar pantallas).
create policy business_modules_select on public.business_modules
  for select to authenticated
  using (private.is_member(business_id));

-- Base para las reglas de las tablas futuras (turnos, clientes): ¿el módulo está encendido?
create function private.module_enabled(p_business uuid, p_module public.business_module)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.business_modules bm
    where bm.business_id = p_business and bm.module = p_module and bm.enabled
  );
$$;
revoke all on function private.module_enabled(uuid, public.business_module) from public;
grant execute on function private.module_enabled(uuid, public.business_module) to authenticated;

-- Guarda qué módulos quedan encendidos (los que no están en la lista quedan apagados).
-- Con p_finish_setup = true marca la puesta en marcha como terminada (solo la primera vez).
-- Apagar un módulo NO borra sus datos: solo deja de mostrarse.
create function public.save_modules(
  p_business uuid,
  p_enabled public.business_module[],
  p_finish_setup boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede cambiar los módulos del negocio.';
  end if;

  insert into public.business_modules (business_id, module, enabled)
  select p_business, m, m = any (coalesce(p_enabled, array[]::public.business_module[]))
  from unnest(enum_range(null::public.business_module)) as m
  on conflict (business_id, module)
  do update set enabled = excluded.enabled, updated_at = now();

  if p_finish_setup then
    update public.businesses
       set setup_completed_at = coalesce(setup_completed_at, now())
     where id = p_business;
  end if;
end;
$$;
revoke all on function public.save_modules(uuid, public.business_module[], boolean) from public, anon;
grant execute on function public.save_modules(uuid, public.business_module[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Widgets del inicio: la disposición es personal (cada persona la suya, por negocio).
-- layout es una lista JSON, por ejemplo [{"id":"ventas_hoy","size":"M"}]. Qué widgets existen
-- lo valida la aplicación; acá solo se limita la forma y el tamaño para evitar abusos.
-- ---------------------------------------------------------------------------
create table public.user_widgets (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  layout jsonb not null default '[]'::jsonb
    check (jsonb_typeof(layout) = 'array' and jsonb_array_length(layout) <= 30 and pg_column_size(layout) <= 8192),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

alter table public.user_widgets enable row level security;
alter table public.user_widgets force row level security;
revoke all on public.user_widgets from anon, authenticated;
grant select on public.user_widgets to authenticated;
grant insert (business_id, user_id, layout) on public.user_widgets to authenticated;
grant update (layout) on public.user_widgets to authenticated;

create policy user_widgets_select on public.user_widgets
  for select to authenticated
  using (user_id = auth.uid() and private.is_member(business_id));
create policy user_widgets_insert on public.user_widgets
  for insert to authenticated
  with check (user_id = auth.uid() and private.is_member(business_id));
create policy user_widgets_update on public.user_widgets
  for update to authenticated
  using (user_id = auth.uid() and private.is_member(business_id))
  with check (user_id = auth.uid() and private.is_member(business_id));

create function private.touch_user_widgets()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger user_widgets_touch
before update on public.user_widgets
for each row execute function private.touch_user_widgets();
