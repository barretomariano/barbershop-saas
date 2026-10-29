-- Etapa D (parte 3): proveedores, gastos recurrentes, caja y cierre diario, liquidación de comisiones,
-- presupuestos, auditoría y reportes. Se aplica una sola vez en el SQL Editor. No modifica datos existentes.
-- Reglas clave:
--  * Todo lo de esta migración es solo para dueño y encargado, salvo lo que se indica (los barberos ven sus liquidaciones).
--  * El cierre de caja y la liquidación calculan los montos en la base y no se pueden editar ni borrar.
--  * Una venta ya liquidada no se puede anular (evita pagar una comisión de una venta que después desaparece).
--  * La auditoría la escribe solo la base (triggers) y solo la lee el dueño.

-- Fecha y comienzo de día en hora argentina.
create function private.ar_today() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create function private.ar_day_start(p_day date) returns timestamptz
language sql immutable set search_path = ''
as $$ select (p_day::timestamp at time zone 'America/Argentina/Buenos_Aires') $$;

-- ---------------------------------------------------------------------------
-- 1. Proveedores, y gasto con proveedor opcional
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  phone text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  notes text check (notes is null or char_length(notes) <= 300),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index suppliers_business_name_active_uidx on public.suppliers (business_id, name) where active;

alter table public.suppliers enable row level security;
alter table public.suppliers force row level security;
revoke all on public.suppliers from anon, authenticated;
grant select on public.suppliers to authenticated;
grant insert (business_id, name, phone, notes) on public.suppliers to authenticated;
grant update (name, phone, notes, active) on public.suppliers to authenticated;
create policy suppliers_select on public.suppliers for select to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));
create policy suppliers_update on public.suppliers for update to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]))
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

alter table public.expenses add column supplier_id uuid references public.suppliers(id) on delete restrict;

drop function public.register_expense(uuid, text, integer, uuid, text, timestamptz);
create function public.register_expense(
  p_business uuid,
  p_category text,
  p_amount integer,
  p_idempotency_key uuid,
  p_description text default null,
  p_spent_at timestamptz default now(),
  p_supplier uuid default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para registrar gastos.'; end if;
  if not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para registrar gastos en este negocio.';
  end if;
  if p_category is null or p_category not in ('ALQUILER','SERVICIOS','INSUMOS','SUELDOS','IMPUESTOS','OTROS') then
    raise exception 'La categoría del gasto no es válida.';
  end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'El monto debe ser un número entero de pesos mayor a 0.';
  end if;
  if p_spent_at > now() + interval '5 minutes' then
    raise exception 'La fecha del gasto no puede ser futura.';
  end if;
  if p_spent_at < now() - interval '90 days' then
    raise exception 'La fecha del gasto no puede tener más de 90 días de antigüedad.';
  end if;
  if p_supplier is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier and s.business_id = p_business and s.active
  ) then
    raise exception 'El proveedor no existe o está inactivo.';
  end if;

  insert into public.expenses (business_id, category, description, amount, spent_at, created_by, idempotency_key, supplier_id)
  values (p_business, p_category, nullif(btrim(p_description), ''), p_amount, p_spent_at, auth.uid(), p_idempotency_key, p_supplier)
  on conflict (business_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.expenses e
     where e.business_id = p_business and e.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;
revoke all on function public.register_expense(uuid, text, integer, uuid, text, timestamptz, uuid) from public, anon;
grant execute on function public.register_expense(uuid, text, integer, uuid, text, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Gastos recurrentes: se generan solos una vez por mes, desde el día elegido (1 a 28)
-- ---------------------------------------------------------------------------
create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  category text not null check (category in ('ALQUILER','SERVICIOS','INSUMOS','SUELDOS','IMPUESTOS','OTROS')),
  description text check (description is null or char_length(description) <= 200),
  amount integer not null check (amount between 1 and 100000000),
  day_of_month smallint not null check (day_of_month between 1 and 28),
  supplier_id uuid references public.suppliers(id) on delete restrict,
  active boolean not null default true,
  last_generated_month date,
  created_at timestamptz not null default now()
);

alter table public.recurring_expenses enable row level security;
alter table public.recurring_expenses force row level security;
revoke all on public.recurring_expenses from anon, authenticated;
grant select on public.recurring_expenses to authenticated;
grant insert (business_id, category, description, amount, day_of_month, supplier_id) on public.recurring_expenses to authenticated;
grant update (category, description, amount, day_of_month, supplier_id, active) on public.recurring_expenses to authenticated;
create policy recurring_select on public.recurring_expenses for select to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));
create policy recurring_insert on public.recurring_expenses for insert to authenticated
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));
create policy recurring_update on public.recurring_expenses for update to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]))
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

-- Genera los gastos recurrentes del mes en curso que todavía no se generaron. Se puede llamar las
-- veces que haga falta: nunca duplica. Devuelve cuántos generó.
create function public.generate_recurring_expenses(p_business uuid)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  r public.recurring_expenses%rowtype;
  v_month date := date_trunc('month', private.ar_today())::date;
  v_n integer := 0;
  v_id uuid;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para generar gastos recurrentes.';
  end if;
  for r in
    select * from public.recurring_expenses x
     where x.business_id = p_business and x.active
       and (x.last_generated_month is null or x.last_generated_month < v_month)
       and extract(day from private.ar_today())::integer >= x.day_of_month
     for update
  loop
    insert into public.expenses (business_id, category, description, amount, spent_at, created_by, idempotency_key, supplier_id)
    values (
      p_business, r.category, coalesce(r.description, 'Gasto recurrente'), r.amount,
      least(now(), private.ar_day_start(v_month + (r.day_of_month - 1)) + interval '12 hours'),
      auth.uid(), md5(r.id::text || v_month::text)::uuid, r.supplier_id
    )
    on conflict (business_id, idempotency_key) do nothing
    returning id into v_id;
    update public.recurring_expenses set last_generated_month = v_month where id = r.id;
    if v_id is not null then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.generate_recurring_expenses(uuid) from public, anon;
grant execute on function public.generate_recurring_expenses(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Caja y cierre diario
-- Efectivo esperado = lo cobrado en efectivo ese día (ventas válidas). La persona cuenta el efectivo real
-- y el sistema guarda la diferencia. Un día se cierra una sola vez y el cierre no se edita.
-- ---------------------------------------------------------------------------
create table public.cash_closings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  closing_date date not null,
  expected_cash bigint not null,
  counted_cash bigint not null check (counted_cash between 0 and 1000000000),
  difference bigint not null,
  sales_count integer not null,
  sales_total bigint not null,
  expenses_total bigint not null,
  by_method jsonb not null,
  note text check (note is null or char_length(note) <= 300),
  closed_by uuid not null references auth.users(id),
  closed_at timestamptz not null default now(),
  unique (business_id, closing_date)
);

create function private.immutable_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Este registro no se puede modificar ni borrar.';
end $$;
create trigger cash_closings_immutable before update or delete on public.cash_closings
for each row execute function private.immutable_row();

alter table public.cash_closings enable row level security;
alter table public.cash_closings force row level security;
revoke all on public.cash_closings from anon, authenticated;
grant select on public.cash_closings to authenticated;
create policy cash_closings_select on public.cash_closings for select to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

create function public.close_day(p_business uuid, p_date date, p_counted integer, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to timestamptz;
  v_expected bigint;
  v_count integer;
  v_total bigint;
  v_exp bigint;
  v_methods jsonb;
  v_id uuid;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para cerrar la caja.';
  end if;
  if p_date is null or p_date > private.ar_today() then raise exception 'No se puede cerrar la caja de un día futuro.'; end if;
  if p_date < private.ar_today() - 30 then raise exception 'Solo se pueden cerrar los últimos 30 días.'; end if;
  if p_counted is null or p_counted < 0 or p_counted > 1000000000 then
    raise exception 'El efectivo contado debe ser un monto entero de pesos (puede ser 0).';
  end if;
  if exists (select 1 from public.cash_closings c where c.business_id = p_business and c.closing_date = p_date) then
    raise exception 'La caja de ese día ya está cerrada.';
  end if;

  v_from := private.ar_day_start(p_date);
  v_to := private.ar_day_start(p_date + 1);

  select coalesce(sum(s.amount) filter (where s.payment_method = 'EFECTIVO'), 0)::bigint,
         count(*)::integer, coalesce(sum(s.amount), 0)::bigint
    into v_expected, v_count, v_total
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= v_from and s.sold_at < v_to;

  select coalesce(sum(e.amount), 0)::bigint into v_exp
    from public.expenses e
   where e.business_id = p_business and e.status = 'VALID' and e.spent_at >= v_from and e.spent_at < v_to;

  select coalesce(jsonb_object_agg(t.payment_method, t.total), '{}'::jsonb) into v_methods
    from (select s.payment_method, sum(s.amount)::bigint as total
            from public.sales s
           where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= v_from and s.sold_at < v_to
           group by s.payment_method) t;

  insert into public.cash_closings (business_id, closing_date, expected_cash, counted_cash, difference, sales_count,
                                    sales_total, expenses_total, by_method, note, closed_by)
  values (p_business, p_date, v_expected, p_counted, p_counted - v_expected, v_count, v_total, v_exp, v_methods,
          nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.close_day(uuid, date, integer, text) from public, anon;
grant execute on function public.close_day(uuid, date, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Liquidación de comisiones (solo ventas con comisión por porcentaje)
-- ---------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  barber_membership_id uuid not null references public.memberships(id) on delete restrict,
  upto date not null,
  sales_count integer not null check (sales_count > 0),
  sales_total bigint not null,
  amount bigint not null check (amount >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.settlement_sales (
  sale_id uuid primary key references public.sales(id) on delete restrict,   -- una venta se liquida una sola vez
  settlement_id uuid not null references public.settlements(id) on delete restrict
);
create trigger settlements_immutable before update or delete on public.settlements
for each row execute function private.immutable_row();
create trigger settlement_sales_immutable before update or delete on public.settlement_sales
for each row execute function private.immutable_row();

alter table public.settlements enable row level security;
alter table public.settlements force row level security;
alter table public.settlement_sales enable row level security;
alter table public.settlement_sales force row level security;
revoke all on public.settlements from anon, authenticated;
revoke all on public.settlement_sales from anon, authenticated;
grant select on public.settlements to authenticated;
grant select on public.settlement_sales to authenticated;
-- Se ve el vínculo solo de las ventas que la persona ya puede ver (las reglas de ventas mandan).
create policy settlement_sales_select on public.settlement_sales for select to authenticated
  using (exists (select 1 from public.sales s where s.id = sale_id));
create policy settlements_select on public.settlements for select to authenticated
  using (
    private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
    or exists (select 1 from public.memberships m where m.id = barber_membership_id and m.user_id = auth.uid())
  );

-- Cuánto hay para liquidar hasta una fecha (inclusive), por persona. Respeta RLS: un barbero ve solo lo suyo.
create function public.pendiente_liquidacion(p_business uuid, p_upto date)
returns table (barber_membership_id uuid, cantidad bigint, vendido bigint, a_pagar bigint)
language sql stable security invoker set search_path = ''
as $$
  select s.barber_membership_id, count(*), sum(s.amount)::bigint, sum(s.barber_amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.commission_model = 'PERCENT'
     and s.sold_at < private.ar_day_start(p_upto + 1)
     and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id)
   group by s.barber_membership_id;
$$;
revoke all on function public.pendiente_liquidacion(uuid, date) from public, anon;
grant execute on function public.pendiente_liquidacion(uuid, date) to authenticated;

create function public.settle_commissions(p_business uuid, p_membership uuid, p_upto date, p_note text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit timestamptz;
  v_count integer;
  v_total bigint;
  v_amount bigint;
  v_id uuid;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para liquidar comisiones.';
  end if;
  if not exists (select 1 from public.memberships m where m.id = p_membership and m.business_id = p_business) then
    raise exception 'La persona indicada no existe en este negocio.';
  end if;
  if p_upto is null or p_upto > private.ar_today() then raise exception 'La fecha de corte no puede ser futura.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_membership::text));   -- evita liquidar dos veces en simultáneo
  v_limit := private.ar_day_start(p_upto + 1);

  select count(*)::integer, coalesce(sum(s.amount), 0)::bigint, coalesce(sum(s.barber_amount), 0)::bigint
    into v_count, v_total, v_amount
    from public.sales s
   where s.business_id = p_business and s.barber_membership_id = p_membership
     and s.status = 'VALID' and s.commission_model = 'PERCENT' and s.sold_at < v_limit
     and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id);
  if v_count = 0 then raise exception 'No hay ventas para liquidar hasta esa fecha.'; end if;

  insert into public.settlements (business_id, barber_membership_id, upto, sales_count, sales_total, amount, note, created_by)
  values (p_business, p_membership, p_upto, v_count, v_total, v_amount, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;

  insert into public.settlement_sales (sale_id, settlement_id)
  select s.id, v_id from public.sales s
   where s.business_id = p_business and s.barber_membership_id = p_membership
     and s.status = 'VALID' and s.commission_model = 'PERCENT' and s.sold_at < v_limit
     and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id);
  return v_id;
end $$;
revoke all on function public.settle_commissions(uuid, uuid, date, text) from public, anon;
grant execute on function public.settle_commissions(uuid, uuid, date, text) to authenticated;

-- Una venta ya liquidada no se puede anular.
create or replace function public.cancel_sale(p_sale uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
begin
  select * into v_sale from public.sales where id = p_sale;
  if not found or not private.has_role(v_sale.business_id, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para anular esta venta.';
  end if;
  if v_sale.status = 'CANCELED' then raise exception 'La venta ya estaba anulada.'; end if;
  if exists (select 1 from public.settlement_sales ss where ss.sale_id = p_sale) then
    raise exception 'Esta venta ya fue incluida en una liquidación de comisiones y no se puede anular.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Indicá el motivo de la anulación.';
  end if;
  update public.sales
     set status = 'CANCELED', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_sale;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Presupuestos mensuales por categoría de gasto (solo el dueño los define)
-- ---------------------------------------------------------------------------
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  category text not null check (category in ('ALQUILER','SERVICIOS','INSUMOS','SUELDOS','IMPUESTOS','OTROS')),
  month date not null check (month = date_trunc('month', month)::date),
  amount integer not null check (amount between 1 and 1000000000),
  unique (business_id, category, month)
);
alter table public.budgets enable row level security;
alter table public.budgets force row level security;
revoke all on public.budgets from anon, authenticated;
grant select on public.budgets to authenticated;
create policy budgets_select on public.budgets for select to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

create function public.set_budget(p_business uuid, p_category text, p_month date, p_amount integer)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_month date := date_trunc('month', p_month)::date;
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede definir los presupuestos.';
  end if;
  if p_category is null or p_category not in ('ALQUILER','SERVICIOS','INSUMOS','SUELDOS','IMPUESTOS','OTROS') then
    raise exception 'La categoría no es válida.';
  end if;
  if p_amount is null or p_amount = 0 then
    delete from public.budgets b where b.business_id = p_business and b.category = p_category and b.month = v_month;
    return;
  end if;
  if p_amount < 0 or p_amount > 1000000000 then raise exception 'El presupuesto debe ser un monto entero de pesos.'; end if;
  insert into public.budgets (business_id, category, month, amount) values (p_business, p_category, v_month, p_amount)
  on conflict (business_id, category, month) do update set amount = excluded.amount;
end $$;
revoke all on function public.set_budget(uuid, text, date, integer) from public, anon;
grant execute on function public.set_budget(uuid, text, date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reportes (corren con los permisos de quien llama: un barbero solo ve lo suyo)
-- ---------------------------------------------------------------------------
create function public.serie_diaria(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (dia date, cantidad bigint, vendido bigint, para_local bigint)
language sql stable security invoker set search_path = ''
as $$
  select (s.sold_at at time zone 'America/Argentina/Buenos_Aires')::date, count(*), sum(s.amount)::bigint, sum(s.local_amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by 1 order by 1;
$$;

create function public.ventas_por_hora(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (hora integer, cantidad bigint, vendido bigint)
language sql stable security invoker set search_path = ''
as $$
  select extract(hour from s.sold_at at time zone 'America/Argentina/Buenos_Aires')::integer, count(*), sum(s.amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by 1 order by 1;
$$;

create function public.top_clientes(p_business uuid, p_desde timestamptz, p_hasta timestamptz, p_limite integer default 10)
returns table (client_id uuid, nombre text, visitas bigint, gastado bigint)
language sql stable security invoker set search_path = ''
as $$
  select c.id, c.name, count(*), sum(s.amount)::bigint
    from public.sales s join public.clients c on c.id = s.client_id
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by c.id, c.name order by 4 desc limit greatest(1, least(coalesce(p_limite, 10), 50));
$$;
revoke all on function public.serie_diaria(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.ventas_por_hora(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.top_clientes(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function public.serie_diaria(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.ventas_por_hora(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.top_clientes(uuid, timestamptz, timestamptz, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Auditoría de cambios (la escribe solo la base; la lee solo el dueño)
-- Registra altas y cambios de equipo, comisiones, servicios, módulos, metas, presupuestos, proveedores,
-- gastos recurrentes, anulaciones, cierres de caja y liquidaciones.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete restrict,
  user_id uuid default auth.uid(),
  at timestamptz not null default now(),
  action text not null,
  entity text not null,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb
);
create index audit_log_business_at_idx on public.audit_log (business_id, at desc);
create trigger audit_log_immutable before update or delete on public.audit_log
for each row execute function private.immutable_row();

alter table public.audit_log enable row level security;
alter table public.audit_log force row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;
create policy audit_log_select on public.audit_log for select to authenticated
  using (private.has_role(business_id, array['OWNER']::public.business_role[]));

create function private.audit_row() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_new jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_detail jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, n.value), '{}'::jsonb) into v_detail
      from jsonb_each(v_new) n where v_old -> n.key is distinct from n.value;
    if v_detail = '{}'::jsonb then return null; end if;
  else
    v_detail := v_row;
  end if;
  insert into public.audit_log (business_id, action, entity, entity_id, detail)
  values ((v_row ->> 'business_id')::uuid, tg_op, tg_table_name, (v_row ->> 'id')::uuid, v_detail);
  return null;
end $$;

create trigger audit_sales after update on public.sales for each row execute function private.audit_row();
create trigger audit_expenses after update on public.expenses for each row execute function private.audit_row();
create trigger audit_memberships after insert or update on public.memberships for each row execute function private.audit_row();
create trigger audit_services after insert or update on public.services for each row execute function private.audit_row();
create trigger audit_modules after insert or update on public.business_modules for each row execute function private.audit_row();
create trigger audit_goals after insert or update or delete on public.sales_goals for each row execute function private.audit_row();
create trigger audit_budgets after insert or update or delete on public.budgets for each row execute function private.audit_row();
create trigger audit_suppliers after insert or update on public.suppliers for each row execute function private.audit_row();
create trigger audit_recurring after insert or update on public.recurring_expenses for each row execute function private.audit_row();
create trigger audit_closings after insert on public.cash_closings for each row execute function private.audit_row();
create trigger audit_settlements after insert on public.settlements for each row execute function private.audit_row();
