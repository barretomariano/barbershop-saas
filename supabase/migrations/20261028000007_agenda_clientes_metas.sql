-- Etapa D (parte 2): agenda de turnos, clientes, metas de ventas, montos fijos y resúmenes extra.
-- Se aplica una sola vez en el SQL Editor. No borra ni modifica datos existentes.
-- Reglas clave:
--  * AGENDA y CLIENTES solo funcionan si el dueño encendió el módulo (migración 6).
--  * Los turnos se crean y cambian SOLO con funciones (el navegador no escribe directo).
--  * Un turno terminado NUNCA se convierte solo en venta: hay que cobrarlo (monto y medio de pago).
--  * Un barbero no puede tener dos turnos al mismo tiempo; los turnos van en bloques de 15 minutos.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Duración de cada servicio (para sugerir la duración del turno)
-- ---------------------------------------------------------------------------
alter table public.services
  add column duration_minutes integer not null default 30
  check (duration_minutes between 15 and 480 and duration_minutes % 15 = 0);
grant update (duration_minutes) on public.services to authenticated;
grant insert (duration_minutes) on public.services to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Monto fijo mensual por persona: alquiler de silla (suma al local) o sueldo (cuenta como gasto)
-- ---------------------------------------------------------------------------
alter table public.memberships
  add column fixed_monthly integer not null default 0 check (fixed_monthly between 0 and 100000000);
grant update (fixed_monthly) on public.memberships to authenticated;

create function public.fijos_mensuales(p_business uuid)
returns table (alquiler_silla bigint, sueldos bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(sum(m.fixed_monthly) filter (where m.commission_model = 'CHAIR_RENT'), 0)::bigint,
         coalesce(sum(m.fixed_monthly) filter (where m.commission_model = 'SALARY'), 0)::bigint
    from public.memberships m
   where m.business_id = p_business and m.active and m.commission_configured;
$$;
revoke all on function public.fijos_mensuales(uuid) from public, anon;
grant execute on function public.fijos_mensuales(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Clientes (módulo CLIENTES)
-- ---------------------------------------------------------------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index clients_business_name_idx on public.clients (business_id, name);

alter table public.clients enable row level security;
alter table public.clients force row level security;
revoke all on public.clients from anon, authenticated;
grant select on public.clients to authenticated;
grant insert (business_id, name, phone, notes) on public.clients to authenticated;
grant update (name, phone, notes, active) on public.clients to authenticated;

create policy clients_select on public.clients for select to authenticated
  using (private.is_member(business_id) and private.module_enabled(business_id, 'CLIENTES'));
create policy clients_insert on public.clients for insert to authenticated
  with check (private.is_member(business_id) and private.module_enabled(business_id, 'CLIENTES'));
create policy clients_update on public.clients for update to authenticated
  using (private.is_member(business_id) and private.module_enabled(business_id, 'CLIENTES'))
  with check (private.is_member(business_id) and private.module_enabled(business_id, 'CLIENTES'));

-- Un barbero puede cargar y editar clientes, pero solo dueño y encargado los desactivan.
create function private.clients_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.business_id <> old.business_id then raise exception 'No se puede cambiar el negocio de un cliente.'; end if;
  if new.active <> old.active and not private.has_role(old.business_id, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'Solo el dueño o el encargado pueden desactivar clientes.';
  end if;
  return new;
end $$;
create trigger clients_guard before update on public.clients
for each row execute function private.clients_guard();

-- ---------------------------------------------------------------------------
-- 4. register_sale con cliente opcional (reemplaza a la versión anterior, misma lógica)
-- ---------------------------------------------------------------------------
alter table public.sales add column client_id uuid references public.clients(id) on delete restrict;
create index sales_client_idx on public.sales (client_id) where client_id is not null;

drop function public.register_sale(uuid, uuid, integer, public.payment_method, uuid, uuid, timestamptz, text);

create function public.register_sale(
  p_business uuid,
  p_barber_membership uuid,
  p_amount integer,
  p_payment public.payment_method,
  p_idempotency_key uuid,
  p_service uuid default null,
  p_sold_at timestamptz default now(),
  p_note text default null,
  p_client uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller_role public.business_role;
  v_seller public.memberships%rowtype;
  v_service public.services%rowtype;
  v_model public.commission_model;
  v_bps integer;
  v_barber_amount integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para registrar ventas.'; end if;

  select m.role into v_caller_role from public.memberships m
   where m.business_id = p_business and m.user_id = auth.uid() and m.active;
  if v_caller_role is null then raise exception 'No tenés acceso a este negocio.'; end if;

  select * into v_seller from public.memberships m
   where m.id = p_barber_membership and m.business_id = p_business and m.active;
  if not found then raise exception 'La persona indicada no existe en este negocio.'; end if;

  if v_caller_role = 'BARBER' and v_seller.user_id <> auth.uid() then
    raise exception 'Un barbero solo puede registrar sus propias ventas.';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'El monto debe ser un número entero de pesos mayor a 0.';
  end if;
  if p_sold_at > now() + interval '5 minutes' then
    raise exception 'La fecha de la venta no puede ser futura.';
  end if;
  if p_sold_at < now() - interval '90 days' then
    raise exception 'La fecha de la venta no puede tener más de 90 días de antigüedad.';
  end if;

  if v_seller.commission_configured then
    v_model := v_seller.commission_model;
    v_bps := v_seller.commission_bps;
  elsif v_seller.role = 'BARBER' then
    raise exception 'Falta configurar la comisión de este barbero (lo hace el dueño).';
  else
    v_model := 'PERCENT';
    v_bps := 0;
  end if;

  if p_service is not null then
    select * into v_service from public.services s
     where s.id = p_service and s.business_id = p_business and s.active;
    if not found then raise exception 'El servicio no existe o está inactivo.'; end if;
  end if;

  if p_client is not null then
    if not exists (select 1 from public.clients c where c.id = p_client and c.business_id = p_business and c.active) then
      raise exception 'El cliente no existe o está inactivo.';
    end if;
  end if;

  v_barber_amount := case v_model
    when 'PERCENT'    then round(p_amount::numeric * v_bps / 10000)::integer
    when 'CHAIR_RENT' then p_amount
    when 'SALARY'     then 0
  end;

  insert into public.sales (
    business_id, barber_membership_id, barber_user_id, service_id, service_name, amount,
    payment_method, sold_at, note, commission_model, commission_bps, barber_amount,
    local_amount, created_by, idempotency_key, client_id
  ) values (
    p_business, v_seller.id, v_seller.user_id, v_service.id, v_service.name, p_amount,
    p_payment, p_sold_at, nullif(btrim(p_note), ''), v_model,
    v_bps, v_barber_amount, p_amount - v_barber_amount, auth.uid(),
    p_idempotency_key, p_client
  )
  on conflict (business_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select s.id into v_id from public.sales s
     where s.business_id = p_business and s.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

revoke all on function public.register_sale(uuid, uuid, integer, public.payment_method, uuid, uuid, timestamptz, text, uuid) from public, anon;
grant execute on function public.register_sale(uuid, uuid, integer, public.payment_method, uuid, uuid, timestamptz, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Horarios de trabajo por barbero (si no tiene ninguno cargado, no hay restricción)
-- weekday: 1 = lunes ... 7 = domingo. Hora argentina.
-- ---------------------------------------------------------------------------
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  membership_id uuid not null references public.memberships(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index working_hours_membership_idx on public.working_hours (membership_id);

alter table public.working_hours enable row level security;
alter table public.working_hours force row level security;
revoke all on public.working_hours from anon, authenticated;
grant select on public.working_hours to authenticated;

create policy working_hours_select on public.working_hours for select to authenticated
  using (
    private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
    or exists (select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid())
  );

-- Reemplaza todos los horarios de una persona. p_hours: [{"weekday":1,"start":"09:00","end":"13:00"}, ...]
create function public.save_working_hours(p_business uuid, p_membership uuid, p_hours jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_start time;
  v_end time;
  v_day integer;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para cambiar los horarios.';
  end if;
  if not exists (select 1 from public.memberships m where m.id = p_membership and m.business_id = p_business) then
    raise exception 'La persona indicada no existe en este negocio.';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 21 then
    raise exception 'Los horarios no tienen un formato válido.';
  end if;

  delete from public.working_hours where membership_id = p_membership;
  for v_item in select * from jsonb_array_elements(p_hours) loop
    begin
      v_day := (v_item->>'weekday')::integer;
      v_start := (v_item->>'start')::time;
      v_end := (v_item->>'end')::time;
    exception when others then
      raise exception 'Los horarios no tienen un formato válido.';
    end;
    if v_day not between 1 and 7 or v_end <= v_start then
      raise exception 'Cada horario necesita un día válido y una hora de fin posterior al inicio.';
    end if;
    insert into public.working_hours (business_id, membership_id, weekday, start_time, end_time)
    values (p_business, p_membership, v_day, v_start, v_end);
  end loop;
end $$;
revoke all on function public.save_working_hours(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_working_hours(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Turnos (módulo AGENDA)
-- SCHEDULED = programado, DONE = terminado y pendiente de cobro, PAID = cobrado (tiene venta),
-- CANCELED = cancelado, NO_SHOW = el cliente no vino.
-- ---------------------------------------------------------------------------
create type public.appointment_status as enum ('SCHEDULED', 'DONE', 'PAID', 'CANCELED', 'NO_SHOW');

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  barber_membership_id uuid not null references public.memberships(id) on delete restrict,
  client_id uuid references public.clients(id) on delete restrict,
  client_name text check (client_name is null or char_length(btrim(client_name)) between 1 and 80),
  service_id uuid references public.services(id) on delete restrict,
  service_name text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'SCHEDULED',
  note text check (note is null or char_length(note) <= 200),
  sale_id uuid references public.sales(id) on delete restrict,
  cancel_reason text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  idempotency_key uuid not null,
  unique (business_id, idempotency_key),
  check (ends_at > starts_at),
  check ((status = 'PAID') = (sale_id is not null)),
  -- Un barbero no puede tener dos turnos programados superpuestos.
  constraint appointments_no_overlap exclude using gist (
    barber_membership_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status = 'SCHEDULED')
);
create index appointments_business_start_idx on public.appointments (business_id, starts_at);
create index appointments_barber_start_idx on public.appointments (barber_membership_id, starts_at);

alter table public.appointments enable row level security;
alter table public.appointments force row level security;
revoke all on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;   -- escribir: solo con las funciones de abajo

create policy appointments_select on public.appointments for select to authenticated
  using (
    private.module_enabled(business_id, 'AGENDA')
    and (
      private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
      or exists (select 1 from public.memberships m where m.id = barber_membership_id and m.user_id = auth.uid())
    )
  );

-- Permiso común: dueño/encargado sobre cualquier turno; barbero solo sobre los suyos.
create function private.can_manage_appointment(p_business uuid, p_barber_membership uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[])
      or exists (select 1 from public.memberships m
                  where m.id = p_barber_membership and m.business_id = p_business
                    and m.user_id = auth.uid() and m.active);
$$;
revoke all on function private.can_manage_appointment(uuid, uuid) from public;
grant execute on function private.can_manage_appointment(uuid, uuid) to authenticated;

create function public.create_appointment(
  p_business uuid,
  p_barber_membership uuid,
  p_starts_at timestamptz,
  p_idempotency_key uuid,
  p_duration_minutes integer default null,
  p_service uuid default null,
  p_client uuid default null,
  p_client_name text default null,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_seller public.memberships%rowtype;
  v_service public.services%rowtype;
  v_minutes integer;
  v_ends timestamptz;
  v_ls timestamp;
  v_le timestamp;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para agendar turnos.'; end if;
  if not private.is_member(p_business) then raise exception 'No tenés acceso a este negocio.'; end if;
  if not private.module_enabled(p_business, 'AGENDA') then raise exception 'La agenda no está activada en este negocio.'; end if;

  select * into v_seller from public.memberships m
   where m.id = p_barber_membership and m.business_id = p_business and m.active;
  if not found then raise exception 'La persona indicada no existe en este negocio.'; end if;
  if not private.can_manage_appointment(p_business, p_barber_membership) then
    raise exception 'Un barbero solo puede agendar sus propios turnos.';
  end if;

  if p_service is not null then
    select * into v_service from public.services s
     where s.id = p_service and s.business_id = p_business and s.active;
    if not found then raise exception 'El servicio no existe o está inactivo.'; end if;
  end if;
  if p_client is not null and not exists (
    select 1 from public.clients c where c.id = p_client and c.business_id = p_business and c.active
  ) then
    raise exception 'El cliente no existe o está inactivo.';
  end if;

  v_minutes := coalesce(p_duration_minutes, v_service.duration_minutes, 30);
  if v_minutes < 15 or v_minutes > 480 or v_minutes % 15 <> 0 then
    raise exception 'La duración debe ser de entre 15 minutos y 8 horas, en bloques de 15 minutos.';
  end if;
  if date_trunc('minute', p_starts_at) <> p_starts_at or extract(minute from p_starts_at)::integer % 15 <> 0 then
    raise exception 'El turno debe empezar en un horario de bloques de 15 minutos (00, 15, 30 o 45).';
  end if;
  if p_starts_at < now() - interval '1 day' then raise exception 'El turno no puede empezar hace más de un día.'; end if;
  if p_starts_at > now() + interval '180 days' then raise exception 'El turno no puede ser a más de 180 días.'; end if;
  v_ends := p_starts_at + make_interval(mins => v_minutes);

  -- Horarios de trabajo: solo se controlan si el barbero tiene alguno cargado.
  if exists (select 1 from public.working_hours w where w.membership_id = p_barber_membership) then
    v_ls := p_starts_at at time zone 'America/Argentina/Buenos_Aires';
    v_le := v_ends at time zone 'America/Argentina/Buenos_Aires';
    if not exists (
      select 1 from public.working_hours w
       where w.membership_id = p_barber_membership
         and w.weekday = extract(isodow from v_ls)::integer
         and v_le::date = v_ls::date
         and v_ls::time >= w.start_time and v_le::time <= w.end_time
    ) then
      raise exception 'El turno queda fuera del horario de trabajo de esta persona.';
    end if;
  end if;

  begin
    insert into public.appointments (
      business_id, barber_membership_id, client_id, client_name, service_id, service_name,
      starts_at, ends_at, note, created_by, idempotency_key
    ) values (
      p_business, v_seller.id, p_client, nullif(btrim(p_client_name), ''), v_service.id, v_service.name,
      p_starts_at, v_ends, nullif(btrim(p_note), ''), auth.uid(), p_idempotency_key
    )
    on conflict (business_id, idempotency_key) do nothing
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese horario se superpone con otro turno de esta persona.';
  end;

  if v_id is null then
    select a.id into v_id from public.appointments a
     where a.business_id = p_business and a.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- Marca el turno como terminado: queda pendiente de cobro (NO genera una venta).
create function public.finish_appointment(p_appointment uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.appointments%rowtype;
begin
  select * into v from public.appointments where id = p_appointment for update;
  if not found or auth.uid() is null or not private.can_manage_appointment(v.business_id, v.barber_membership_id) then
    raise exception 'No tenés permiso para cambiar este turno.';
  end if;
  if v.status <> 'SCHEDULED' then raise exception 'Solo se pueden terminar turnos programados.'; end if;
  update public.appointments set status = 'DONE', status_changed_at = now() where id = p_appointment;
end $$;

-- Cancela el turno o lo marca como "no vino". La cancelación pide motivo.
create function public.cancel_appointment(p_appointment uuid, p_reason text default null, p_no_show boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v public.appointments%rowtype;
begin
  select * into v from public.appointments where id = p_appointment for update;
  if not found or auth.uid() is null or not private.can_manage_appointment(v.business_id, v.barber_membership_id) then
    raise exception 'No tenés permiso para cambiar este turno.';
  end if;
  if v.status not in ('SCHEDULED', 'DONE') then
    raise exception 'Este turno ya no se puede cancelar.';
  end if;
  if not p_no_show and (p_reason is null or char_length(btrim(p_reason)) < 3) then
    raise exception 'Indicá el motivo de la cancelación.';
  end if;
  update public.appointments
     set status = case when p_no_show then 'NO_SHOW'::public.appointment_status else 'CANCELED'::public.appointment_status end,
         cancel_reason = nullif(btrim(p_reason), ''), status_changed_at = now()
   where id = p_appointment;
end $$;

-- Cobra el turno: crea la venta (monto y medio de pago los confirma la persona) y lo marca como cobrado.
create function public.charge_appointment(
  p_appointment uuid,
  p_amount integer,
  p_payment public.payment_method,
  p_idempotency_key uuid
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments%rowtype;
  v_sale uuid;
begin
  select * into v from public.appointments where id = p_appointment for update;
  if not found or auth.uid() is null or not private.can_manage_appointment(v.business_id, v.barber_membership_id) then
    raise exception 'No tenés permiso para cobrar este turno.';
  end if;
  if v.status = 'PAID' then return v.sale_id; end if;   -- ya cobrado: no se duplica
  if v.status not in ('SCHEDULED', 'DONE') then raise exception 'Este turno fue cancelado y no se puede cobrar.'; end if;

  v_sale := public.register_sale(
    v.business_id, v.barber_membership_id, p_amount, p_payment, p_idempotency_key,
    v.service_id, now(), null, v.client_id
  );
  update public.appointments
     set status = 'PAID', sale_id = v_sale, status_changed_at = now()
   where id = p_appointment;
  return v_sale;
end $$;

revoke all on function public.create_appointment(uuid, uuid, timestamptz, uuid, integer, uuid, uuid, text, text) from public, anon;
revoke all on function public.finish_appointment(uuid) from public, anon;
revoke all on function public.cancel_appointment(uuid, text, boolean) from public, anon;
revoke all on function public.charge_appointment(uuid, integer, public.payment_method, uuid) from public, anon;
grant execute on function public.create_appointment(uuid, uuid, timestamptz, uuid, integer, uuid, uuid, text, text) to authenticated;
grant execute on function public.finish_appointment(uuid) to authenticated;
grant execute on function public.cancel_appointment(uuid, text, boolean) to authenticated;
grant execute on function public.charge_appointment(uuid, integer, public.payment_method, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Metas de ventas por mes: del negocio (barber_membership_id vacío) o de un barbero
-- ---------------------------------------------------------------------------
create table public.sales_goals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  barber_membership_id uuid references public.memberships(id) on delete restrict,
  month date not null check (month = date_trunc('month', month)::date),
  amount integer not null check (amount between 1 and 1000000000),
  unique nulls not distinct (business_id, barber_membership_id, month)
);

alter table public.sales_goals enable row level security;
alter table public.sales_goals force row level security;
revoke all on public.sales_goals from anon, authenticated;
grant select on public.sales_goals to authenticated;

create policy sales_goals_select on public.sales_goals for select to authenticated
  using (
    private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
    or exists (select 1 from public.memberships m where m.id = barber_membership_id and m.user_id = auth.uid())
  );

-- Fija la meta de un mes (solo el dueño). Con monto 0 o vacío, borra la meta.
create function public.set_goal(p_business uuid, p_membership uuid, p_month date, p_amount integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede definir las metas.';
  end if;
  if p_membership is not null and not exists (
    select 1 from public.memberships m where m.id = p_membership and m.business_id = p_business
  ) then
    raise exception 'La persona indicada no existe en este negocio.';
  end if;
  if p_amount is null or p_amount = 0 then
    delete from public.sales_goals g
     where g.business_id = p_business and g.month = v_month
       and g.barber_membership_id is not distinct from p_membership;
    return;
  end if;
  if p_amount < 0 or p_amount > 1000000000 then raise exception 'La meta debe ser un monto entero de pesos.'; end if;
  insert into public.sales_goals (business_id, barber_membership_id, month, amount)
  values (p_business, p_membership, v_month, p_amount)
  on conflict (business_id, barber_membership_id, month) do update set amount = excluded.amount;
end $$;
revoke all on function public.set_goal(uuid, uuid, date, integer) from public, anon;
grant execute on function public.set_goal(uuid, uuid, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Desglose por servicio (para los widgets). Cuenta solo ventas válidas; respeta RLS.
-- ---------------------------------------------------------------------------
create function public.resumen_por_servicio(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (service_name text, cantidad bigint, vendido bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(s.service_name, 'Sin servicio'), count(*), sum(s.amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID'
     and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by coalesce(s.service_name, 'Sin servicio')
   order by 3 desc;
$$;
revoke all on function public.resumen_por_servicio(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_por_servicio(uuid, timestamptz, timestamptz) to authenticated;
