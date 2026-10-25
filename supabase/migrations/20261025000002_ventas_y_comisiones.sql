-- Etapa 3: servicios, ventas y comisiones.
-- Reglas clave:
--  * Las ventas se registran SOLO mediante la función register_sale (el navegador no inserta directo).
--  * El monto del barbero y del local se calcula en la base, nunca en el navegador.
--  * Cada venta guarda una copia (snapshot) del modelo y porcentaje usados: si la comisión cambia
--    después, las ventas anteriores no se modifican.
--  * Las ventas no se borran ni se editan: se anulan (CANCELED) con motivo.

create type public.commission_model as enum ('PERCENT', 'CHAIR_RENT', 'SALARY');
create type public.payment_method as enum ('EFECTIVO', 'TRANSFERENCIA', 'DEBITO', 'CREDITO', 'MERCADO_PAGO');
create type public.sale_status as enum ('VALID', 'CANCELED');

-- Configuración de comisión por barbero (la define el OWNER).
-- PERCENT: el barbero recibe un % de cada venta. CHAIR_RENT: el barbero se queda con el 100% de
-- sus ventas (paga un alquiler fijo aparte). SALARY: el barbero cobra sueldo fijo (0% por venta).
alter table public.memberships
  add column commission_model public.commission_model not null default 'PERCENT',
  add column commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  add column commission_configured boolean not null default false;

grant update (commission_model, commission_bps, commission_configured) on public.memberships to authenticated;

-- Servicios del negocio (corte, barba, etc.).
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  default_price integer not null check (default_price > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  barber_membership_id uuid not null references public.memberships(id) on delete restrict,
  barber_user_id uuid not null references auth.users(id) on delete restrict,
  service_id uuid references public.services(id) on delete restrict,
  service_name text,                                   -- copia del nombre al momento de la venta
  amount integer not null check (amount between 1 and 100000000),   -- ARS enteros
  payment_method public.payment_method not null,
  sold_at timestamptz not null,
  note text check (note is null or char_length(note) <= 200),
  commission_model public.commission_model not null,   -- snapshot
  commission_bps integer not null,                     -- snapshot
  barber_amount integer not null check (barber_amount >= 0),
  local_amount integer not null check (local_amount >= 0),
  check (barber_amount + local_amount = amount),
  status public.sale_status not null default 'VALID',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,                       -- evita ventas duplicadas por doble toque
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id),
  cancel_reason text,
  unique (business_id, idempotency_key),
  check ((status = 'VALID' and canceled_at is null) or
         (status = 'CANCELED' and canceled_at is not null and cancel_reason is not null))
);

create index sales_business_sold_idx on public.sales (business_id, sold_at desc);
create index sales_barber_sold_idx on public.sales (barber_membership_id, sold_at desc);

-- Una venta nunca se edita: solo puede pasar de VALID a CANCELED.
create function private.sales_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las ventas no se pueden borrar. Anulá la venta con cancel_sale.';
  end if;
  if (new.id, new.business_id, new.barber_membership_id, new.barber_user_id, new.service_id,
      new.service_name, new.amount, new.payment_method, new.sold_at, new.note,
      new.commission_model, new.commission_bps, new.barber_amount, new.local_amount,
      new.created_by, new.created_at, new.idempotency_key)
     is distinct from
     (old.id, old.business_id, old.barber_membership_id, old.barber_user_id, old.service_id,
      old.service_name, old.amount, old.payment_method, old.sold_at, old.note,
      old.commission_model, old.commission_bps, old.barber_amount, old.local_amount,
      old.created_by, old.created_at, old.idempotency_key) then
    raise exception 'Una venta registrada no se puede modificar. Anulala y registrá una nueva.';
  end if;
  if old.status = 'CANCELED' and new.status <> 'CANCELED' then
    raise exception 'Una venta anulada no se puede reactivar.';
  end if;
  return new;
end $$;

create trigger sales_immutable_trg before update or delete on public.sales
for each row execute function private.sales_immutable();

-- RLS
alter table public.services enable row level security;
alter table public.sales enable row level security;
alter table public.services force row level security;
alter table public.sales force row level security;

revoke all on public.services from anon, authenticated;
revoke all on public.sales from anon, authenticated;
grant select on public.services to authenticated;
grant insert (business_id, name, default_price) on public.services to authenticated;
grant update (name, default_price, active) on public.services to authenticated;
grant select on public.sales to authenticated;   -- escribir: solo vía register_sale / cancel_sale

create policy services_select on public.services for select to authenticated
  using (private.is_member(business_id));
create policy services_insert on public.services for insert to authenticated
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));
create policy services_update on public.services for update to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]))
  with check (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

-- OWNER y MANAGER ven todas las ventas del negocio; un BARBER solo las suyas.
create policy sales_select on public.sales for select to authenticated
  using (
    private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
    or (barber_user_id = auth.uid() and private.is_member(business_id))
  );

-- ---------------------------------------------------------------------------
-- Registrar una venta. Devuelve el id de la venta (el mismo si se repite la misma clave).
-- ---------------------------------------------------------------------------
create function public.register_sale(
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
  v_barber public.memberships%rowtype;
  v_service public.services%rowtype;
  v_barber_amount integer;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para registrar ventas.'; end if;

  select m.role into v_caller_role from public.memberships m
   where m.business_id = p_business and m.user_id = auth.uid() and m.active;
  if v_caller_role is null then raise exception 'No tenés acceso a este negocio.'; end if;

  select * into v_barber from public.memberships m
   where m.id = p_barber_membership and m.business_id = p_business and m.active and m.role = 'BARBER';
  if not found then raise exception 'El barbero indicado no existe en este negocio.'; end if;

  if v_caller_role = 'BARBER' and v_barber.user_id <> auth.uid() then
    raise exception 'Un barbero solo puede registrar sus propias ventas.';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000000 then
    raise exception 'El monto debe ser un número entero de pesos mayor a 0.';
  end if;
  if p_sold_at > now() + interval '5 minutes' then
    raise exception 'La fecha de la venta no puede ser futura.';
  end if;
  if not v_barber.commission_configured then
    raise exception 'Falta configurar la comisión de este barbero (lo hace el dueño).';
  end if;

  if p_service is not null then
    select * into v_service from public.services s
     where s.id = p_service and s.business_id = p_business and s.active;
    if not found then raise exception 'El servicio no existe o está inactivo.'; end if;
  end if;

  -- Cálculo en la base. Redondeo al peso entero; local = resto, así la suma siempre cierra.
  v_barber_amount := case v_barber.commission_model
    when 'PERCENT'    then round(p_amount::numeric * v_barber.commission_bps / 10000)::integer
    when 'CHAIR_RENT' then p_amount
    when 'SALARY'     then 0
  end;

  insert into public.sales (
    business_id, barber_membership_id, barber_user_id, service_id, service_name, amount,
    payment_method, sold_at, note, commission_model, commission_bps, barber_amount,
    local_amount, created_by, idempotency_key
  ) values (
    p_business, v_barber.id, v_barber.user_id, v_service.id, v_service.name, p_amount,
    p_payment, p_sold_at, nullif(btrim(p_note), ''), v_barber.commission_model,
    v_barber.commission_bps, v_barber_amount, p_amount - v_barber_amount, auth.uid(),
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
-- Anular una venta (solo OWNER o MANAGER, con motivo).
-- ---------------------------------------------------------------------------
create function public.cancel_sale(p_sale uuid, p_reason text)
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
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Indicá el motivo de la anulación.';
  end if;
  update public.sales
     set status = 'CANCELED', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_sale;
end $$;

revoke all on function public.register_sale(uuid, uuid, integer, public.payment_method, uuid, uuid, timestamptz, text) from public, anon;
revoke all on function public.cancel_sale(uuid, text) from public, anon;
grant execute on function public.register_sale(uuid, uuid, integer, public.payment_method, uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
