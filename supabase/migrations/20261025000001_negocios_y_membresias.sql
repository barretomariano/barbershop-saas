-- Etapa 2: negocios, membresías, roles y aislamiento entre negocios (RLS).
-- Cada negocio (barbería) es un "tenant". Un usuario accede solo a los negocios
-- donde tiene una membresía activa, con un rol: OWNER, MANAGER o BARBER.

create type public.business_role as enum ('OWNER', 'MANAGER', 'BARBER');
create type public.subscription_status as enum ('trialing', 'active', 'suspended', 'canceled');

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  subscription_status public.subscription_status not null default 'trialing',
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.business_role not null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index memberships_user_idx on public.memberships (user_id) where active;
create index memberships_business_idx on public.memberships (business_id);

-- ---------------------------------------------------------------------------
-- Funciones auxiliares. Corren con permisos del dueño de la función para poder
-- consultar memberships sin que las propias políticas RLS entren en bucle.
-- Viven en un esquema privado que el navegador no puede llamar directamente.
-- ---------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create function private.is_member(p_business uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business and m.user_id = auth.uid() and m.active
  );
$$;

create function private.has_role(p_business uuid, p_roles public.business_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business and m.user_id = auth.uid() and m.active
      and m.role = any (p_roles)
  );
$$;

revoke all on function private.is_member(uuid) from public;
revoke all on function private.has_role(uuid, public.business_role[]) from public;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.business_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Regla: un negocio nunca puede quedarse sin OWNER activo.
-- ---------------------------------------------------------------------------
create function private.keep_one_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := coalesce(old.business_id, new.business_id);
begin
  if old.role = 'OWNER' and old.active then
    if tg_op = 'UPDATE' and new.role = 'OWNER' and new.active then
      return new;
    end if;
    if not exists (
      select 1 from public.memberships m
      where m.business_id = v_business and m.role = 'OWNER' and m.active and m.id <> old.id
    ) then
      raise exception 'El negocio debe conservar al menos un OWNER activo.';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_keep_one_owner
before update or delete on public.memberships
for each row execute function private.keep_one_owner();

-- Un usuario no puede cambiarse a sí mismo el negocio ni el usuario de una membresía.
create function private.memberships_immutable_keys()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.business_id <> old.business_id or new.user_id <> old.user_id then
    raise exception 'No se puede cambiar el negocio ni el usuario de una membresía.';
  end if;
  return new;
end;
$$;

create trigger memberships_immutable
before update on public.memberships
for each row execute function private.memberships_immutable_keys();

-- ---------------------------------------------------------------------------
-- Seguridad por filas (RLS). Sin política = sin acceso.
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.businesses force row level security;
alter table public.memberships force row level security;

-- Permisos de tabla: el navegador (rol authenticated) solo lee y modifica lo mínimo.
revoke all on public.businesses from anon, authenticated;
revoke all on public.memberships from anon, authenticated;
grant select on public.businesses to authenticated;
grant update (name) on public.businesses to authenticated;
grant select on public.memberships to authenticated;
grant insert (business_id, user_id, role, display_name) on public.memberships to authenticated;
grant update (role, display_name, active) on public.memberships to authenticated;
-- Nadie borra membresías desde el navegador: se desactivan (active = false).

-- Negocios: ver el propio; solo OWNER cambia el nombre. Crear/borrar: solo vía administración.
create policy businesses_select on public.businesses
  for select to authenticated
  using (private.is_member(id));

create policy businesses_update_owner on public.businesses
  for update to authenticated
  using (private.has_role(id, array['OWNER']::public.business_role[]))
  with check (private.has_role(id, array['OWNER']::public.business_role[]));

-- Membresías: OWNER y MANAGER ven todo el equipo; un BARBER ve solo la suya.
create policy memberships_select on public.memberships
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
  );

-- Solo OWNER agrega o modifica miembros. Un MANAGER no puede darse ni dar rol OWNER.
create policy memberships_insert_owner on public.memberships
  for insert to authenticated
  with check (private.has_role(business_id, array['OWNER']::public.business_role[]));

create policy memberships_update_owner on public.memberships
  for update to authenticated
  using (private.has_role(business_id, array['OWNER']::public.business_role[]))
  with check (private.has_role(business_id, array['OWNER']::public.business_role[]));

-- ---------------------------------------------------------------------------
-- Alta manual de un negocio piloto (solo administración, desde el SQL Editor).
-- Los usuarios del navegador NO pueden ejecutarla.
-- ---------------------------------------------------------------------------
create function private.admin_create_business(
  p_name text, p_owner_user uuid, p_owner_display_name text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid;
begin
  insert into public.businesses (name) values (p_name) returning id into v_business;
  insert into public.memberships (business_id, user_id, role, display_name)
  values (v_business, p_owner_user, 'OWNER', p_owner_display_name);
  return v_business;
end;
$$;

revoke all on function private.admin_create_business(text, uuid, text) from public, anon, authenticated;
