-- Pausa de barberías que no pagan + herramientas de administración + ping de actividad.
--
-- PAUSAR = apagar a todo el equipo del negocio (memberships.active = false), igual que ya se apaga a un
-- empleado que se va. Como TODA regla de seguridad de la base exige una membresía activa, una barbería
-- pausada no puede leer ni escribir nada. NO se borra ningún dato. REANUDAR vuelve a encender solo a quienes
-- estaban activos al pausar (no revive a empleados que ya se habían dado de baja antes).

alter table public.businesses
  add column if not exists paused_at timestamptz,
  add column if not exists paused_note text;

alter table public.memberships
  add column if not exists paused_off boolean not null default false;

-- La regla "el negocio conserva un OWNER activo" no puede impedir una pausa (que apaga también al dueño).
-- Solo las funciones de administración de abajo (que no puede llamar nadie desde la app) activan esta señal.
create or replace function private.keep_one_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := coalesce(old.business_id, new.business_id);
begin
  if current_setting('app.pausa', true) = 'on' then
    return coalesce(new, old);
  end if;
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

-- Busca un negocio por su nombre exacto (sin importar mayúsculas). Falla si no existe o si hay dos iguales.
create function private.negocio_por_nombre(p_name text)
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_n integer;
  v_id uuid;
begin
  select count(*), min(b.id::text)::uuid into v_n, v_id from public.businesses b where lower(btrim(b.name)) = lower(btrim(p_name));
  if v_n = 0 then raise exception 'No existe una barbería llamada "%". Copiá el nombre exacto de la lista (select * from private.admin_negocios()).', p_name; end if;
  if v_n > 1 then raise exception 'Hay % barberías con el nombre "%". Cambiá el nombre de una antes de pausarla.', v_n, p_name; end if;
  return v_id;
end;
$$;

-- Alta cómoda: alcanza con el email del dueño (el usuario se crea antes en Authentication → Users).
create function private.admin_alta(p_name text, p_owner_email text, p_owner_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_business uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_owner_email));
  if v_user is null then
    raise exception 'No hay un usuario con el email "%". Primero crealo en Authentication → Users → Add user.', p_owner_email;
  end if;
  if exists (select 1 from public.memberships m where m.user_id = v_user) then
    raise exception 'Ese usuario ya pertenece a una barbería.';
  end if;
  if exists (select 1 from public.businesses b where lower(btrim(b.name)) = lower(btrim(p_name))) then
    raise exception 'Ya existe una barbería llamada "%". Usá un nombre distinto.', p_name;
  end if;
  v_business := private.admin_create_business(btrim(p_name), v_user, btrim(p_owner_name));
  return format('Listo: "%s" creada (id %s). El dueño ya puede entrar con %s.', btrim(p_name), v_business, lower(btrim(p_owner_email)));
end;
$$;

create function private.admin_pausar(p_name text, p_nota text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := private.negocio_por_nombre(p_name);
  v_n integer;
begin
  if exists (select 1 from public.businesses b where b.id = v_business and b.paused_at is not null) then
    raise exception 'Esa barbería ya está pausada.';
  end if;
  perform set_config('app.pausa', 'on', true);
  update public.memberships set active = false, paused_off = true where business_id = v_business and active;
  get diagnostics v_n = row_count;
  update public.businesses set paused_at = now(), paused_note = nullif(btrim(coalesce(p_nota, '')), '') where id = v_business;
  return format('Pausada: "%s". Se apagó el acceso de %s personas. No se borró nada.', p_name, v_n);
end;
$$;

create function private.admin_reanudar(p_name text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_business uuid := private.negocio_por_nombre(p_name);
  v_n integer;
begin
  if not exists (select 1 from public.businesses b where b.id = v_business and b.paused_at is not null) then
    raise exception 'Esa barbería no está pausada.';
  end if;
  perform set_config('app.pausa', 'on', true);
  update public.memberships set active = true, paused_off = false where business_id = v_business and paused_off;
  get diagnostics v_n = row_count;
  update public.businesses set paused_at = null, paused_note = null where id = v_business;
  return format('Reanudada: "%s". Volvió el acceso de %s personas, con todos sus datos.', p_name, v_n);
end;
$$;

-- Tablero de control: una fila por barbería, para revisar mes a mes quién usa la app y quién está pausado.
create function private.admin_negocios()
returns table (nombre text, estado text, dueno_email text, personas_activas bigint, ventas_30_dias bigint, ultima_venta timestamptz, creada date, pausada_desde date, nota text)
language sql stable security definer set search_path = ''
as $$
  select b.name,
         case when b.paused_at is null then 'ACTIVA' else 'PAUSADA' end,
         (select u.email::text from public.memberships m join auth.users u on u.id = m.user_id where m.business_id = b.id and m.role = 'OWNER' order by m.created_at limit 1),
         (select count(*) from public.memberships m where m.business_id = b.id and m.active),
         (select count(*) from public.sales s where s.business_id = b.id and s.status = 'VALID' and s.sold_at >= now() - interval '30 days'),
         (select max(s.sold_at) from public.sales s where s.business_id = b.id and s.status = 'VALID'),
         b.created_at::date, b.paused_at::date, b.paused_note
    from public.businesses b
   order by (b.paused_at is not null), b.name;
$$;

-- Para la pantalla "cuenta pausada": un usuario cuyo negocio está pausado no ve nada, pero puede saber que es por eso.
create function public.estado_de_mi_cuenta()
returns table (business_name text, pausada boolean)
language sql stable security definer set search_path = ''
as $$
  select b.name, true
    from public.memberships m join public.businesses b on b.id = m.business_id
   where m.user_id = auth.uid() and m.paused_off and b.paused_at is not null
   limit 1;
$$;

-- Para el ping de GitHub: una consulta mínima a la base que evita que Supabase pause el proyecto por inactividad.
create function public.ping()
returns text
language sql stable set search_path = ''
as $$ select 'ok'::text $$;

revoke all on function private.negocio_por_nombre(text) from public, anon, authenticated;
revoke all on function private.admin_alta(text, text, text) from public, anon, authenticated;
revoke all on function private.admin_pausar(text, text) from public, anon, authenticated;
revoke all on function private.admin_reanudar(text) from public, anon, authenticated;
revoke all on function private.admin_negocios() from public, anon, authenticated;
revoke all on function public.estado_de_mi_cuenta() from public, anon;
grant execute on function public.estado_de_mi_cuenta() to authenticated;
grant execute on function public.ping() to anon, authenticated;
