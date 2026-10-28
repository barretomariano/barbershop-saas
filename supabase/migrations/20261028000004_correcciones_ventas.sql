-- Etapa B: correcciones de ventas y resúmenes calculados en la base.
-- No borra ni modifica datos existentes. Se puede aplicar con la app publicada: la versión
-- anterior de la pantalla sigue funcionando igual (misma firma de register_sale).
--
-- 1. El dueño (OWNER) y el encargado (MANAGER) también pueden figurar como quien atendió.
--    Si no tienen comisión configurada, el 100% de lo que venden queda para el local
--    (comisión 0%). El dueño puede configurarles un porcentaje igual que a un barbero.
-- 2. Un servicio quitado (active = false) libera su nombre: se puede crear uno nuevo igual.
-- 3. La fecha de una venta o gasto no puede tener más de 90 días de antigüedad.
-- 4. Los totales por período se calculan en la base (antes se sumaban en el navegador y
--    quedaban cortados al llegar a 500 ventas).

-- ---------------------------------------------------------------------------
-- 2. Nombres de servicio únicos solo entre los servicios activos
-- ---------------------------------------------------------------------------
alter table public.services drop constraint if exists services_business_id_name_key;
create unique index services_business_name_active_uidx
  on public.services (business_id, name) where active;

-- ---------------------------------------------------------------------------
-- 1 y 3. register_sale: cualquier miembro activo puede ser quien atendió
-- ---------------------------------------------------------------------------
create or replace function public.register_sale(
  p_business uuid,
  p_barber_membership uuid,
  p_amount integer,
  p_payment public.payment_method,
  p_idempotency_key uuid,
  p_service uuid default null,
  p_sold_at timestamptz default now(),
  p_note text default null
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

  -- Quien atendió: cualquier miembro activo del negocio (barbero, encargado o dueño).
  select * into v_seller from public.memberships m
   where m.id = p_barber_membership and m.business_id = p_business and m.active;
  if not found then raise exception 'La persona indicada no existe en este negocio.'; end if;

  -- Un barbero solo registra sus propias ventas. Dueño y encargado registran las de cualquiera.
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

  -- Comisión: un barbero la necesita configurada. Dueño y encargado, si no la tienen, 0%.
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

  -- Cálculo en la base. Redondeo al peso entero; local = resto, así la suma siempre cierra.
  v_barber_amount := case v_model
    when 'PERCENT'    then round(p_amount::numeric * v_bps / 10000)::integer
    when 'CHAIR_RENT' then p_amount
    when 'SALARY'     then 0
  end;

  insert into public.sales (
    business_id, barber_membership_id, barber_user_id, service_id, service_name, amount,
    payment_method, sold_at, note, commission_model, commission_bps, barber_amount,
    local_amount, created_by, idempotency_key
  ) values (
    p_business, v_seller.id, v_seller.user_id, v_service.id, v_service.name, p_amount,
    p_payment, p_sold_at, nullif(btrim(p_note), ''), v_model,
    v_bps, v_barber_amount, p_amount - v_barber_amount, auth.uid(),
    p_idempotency_key
  )
  on conflict (business_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then   -- ya existía: devolvemos la misma venta, sin duplicar
    select s.id into v_id from public.sales s
     where s.business_id = p_business and s.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 3. register_expense: mismo límite de antigüedad
-- ---------------------------------------------------------------------------
create or replace function public.register_expense(
  p_business uuid,
  p_category text,
  p_amount integer,
  p_idempotency_key uuid,
  p_description text default null,
  p_spent_at timestamptz default now()
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

  insert into public.expenses (business_id, category, description, amount, spent_at, created_by, idempotency_key)
  values (p_business, p_category, nullif(btrim(p_description), ''), p_amount, p_spent_at, auth.uid(), p_idempotency_key)
  on conflict (business_id, idempotency_key) do nothing
  returning id into v_id;

  if v_id is null then
    select e.id into v_id from public.expenses e
     where e.business_id = p_business and e.idempotency_key = p_idempotency_key;
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Resúmenes calculados en la base.
-- Corren con los permisos de quien llama (security invoker): las reglas RLS siguen mandando.
-- Un barbero solo ve sus propias ventas; solo dueño y encargado ven los gastos.
-- Solo cuentan las ventas y gastos VÁLIDOS (las anuladas no suman).
-- ---------------------------------------------------------------------------
create function public.resumen_ventas(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (
  barber_membership_id uuid,
  payment_method public.payment_method,
  cantidad bigint,
  vendido bigint,
  para_barbero bigint,
  para_local bigint
)
language sql stable security invoker set search_path = ''
as $$
  select s.barber_membership_id, s.payment_method, count(*),
         sum(s.amount)::bigint, sum(s.barber_amount)::bigint, sum(s.local_amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID'
     and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by s.barber_membership_id, s.payment_method;
$$;

create function public.resumen_gastos(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (category text, cantidad bigint, total bigint)
language sql stable security invoker set search_path = ''
as $$
  select e.category, count(*), sum(e.amount)::bigint
    from public.expenses e
   where e.business_id = p_business and e.status = 'VALID'
     and e.spent_at >= p_desde and e.spent_at < p_hasta
   group by e.category;
$$;

revoke all on function public.resumen_ventas(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.resumen_gastos(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.resumen_ventas(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.resumen_gastos(uuid, timestamptz, timestamptz) to authenticated;
