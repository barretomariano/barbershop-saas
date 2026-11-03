-- Migración 16: cobros de comisiones por día (reemplaza el flujo de "liquidar hasta una fecha" y el conteo de efectivo).
-- El barbero pide cobrar uno o varios días; el dueño o encargado acepta o rechaza. Aceptado = "Lunes cobrado".
-- La app solo REGISTRA el cobro: no mueve plata. Las tablas viejas (settlements, cash_closings) quedan intactas con su historial.
-- Solo cuentan las ventas VÁLIDAS con comisión por porcentaje que no estén ya incluidas en una liquidación vieja.

create table public.payout_days (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  barber_membership_id uuid not null references public.memberships(id) on delete restrict,
  day date not null,                                   -- día en hora argentina
  status text not null check (status in ('REQUESTED', 'PAID', 'REJECTED')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  reject_reason text check (reject_reason is null or char_length(reject_reason) between 3 and 300),
  day_amount integer check (day_amount is null or day_amount >= 0),   -- comisión del día al momento de cobrar
  paid_total integer check (paid_total is null or paid_total >= 0),   -- plata entregada: comisión del día +/- ajustes
  unique (barber_membership_id, day),
  check ((status = 'PAID' and day_amount is not null and paid_total is not null and decided_at is not null)
      or (status = 'REJECTED' and reject_reason is not null and decided_at is not null)
      or (status = 'REQUESTED'))
);
create index payout_days_business_status_idx on public.payout_days (business_id, status);

alter table public.payout_days enable row level security;
alter table public.payout_days force row level security;
revoke all on public.payout_days from anon, authenticated;
grant select on public.payout_days to authenticated;     -- las escrituras solo pasan por las funciones de abajo
create policy payout_days_select on public.payout_days for select to authenticated
  using (
    private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[])
    or exists (select 1 from public.memberships m where m.id = barber_membership_id and m.user_id = auth.uid() and m.active)
  );

create trigger audit_payout_days after insert or update on public.payout_days
for each row execute function private.audit_row();

-- Día argentino de un instante.
create function private.ar_day(p_ts timestamptz) returns date
language sql immutable set search_path = ''
as $$ select (p_ts at time zone 'America/Argentina/Buenos_Aires')::date $$;

-- Comisión de un barbero en un día (ventas válidas por porcentaje, sin liquidación vieja).
create function private.comision_del_dia(p_membership uuid, p_day date) returns bigint
language sql stable set search_path = ''
as $$
  select coalesce(sum(s.barber_amount), 0)::bigint
    from public.sales s
   where s.barber_membership_id = p_membership and s.status = 'VALID' and s.commission_model = 'PERCENT'
     and s.sold_at >= private.ar_day_start(p_day) and s.sold_at < private.ar_day_start(p_day + 1)
     and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id)
$$;

-- Ajuste acumulado de un barbero: lo que hoy valen sus días ya cobrados menos lo que realmente se le entregó.
-- Negativo = se le entregó de más (venta anulada después); positivo = faltó (venta cargada tarde).
create function private.ajuste_de_cobros(p_membership uuid) returns bigint
language sql stable set search_path = ''
as $$
  select coalesce((
    select sum(s.barber_amount)
      from public.sales s
      join public.payout_days p on p.barber_membership_id = s.barber_membership_id and p.status = 'PAID'
                                and private.ar_day(s.sold_at) = p.day
     where s.barber_membership_id = p_membership and s.status = 'VALID' and s.commission_model = 'PERCENT'
       and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id)
  ), 0)::bigint - coalesce((
    select sum(p.paid_total) from public.payout_days p where p.barber_membership_id = p_membership and p.status = 'PAID'
  ), 0)::bigint
$$;
revoke all on function private.comision_del_dia(uuid, date), private.ajuste_de_cobros(uuid) from public, anon, authenticated;   -- solo las usan funciones del dueño de la base
-- private.ar_day la usa dias_cobro (que corre con los permisos de quien la llama), igual que private.ar_day_start.

-- ---------------------------------------------------------------------------
-- El barbero pide cobrar uno o varios días (hoy incluido, hasta 90 días atrás).
-- ---------------------------------------------------------------------------
create function public.request_payout(p_business uuid, p_days date[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_m uuid;
  v_day date;
  v_n integer := 0;
  v_status text;
begin
  select m.id into v_m from public.memberships m
   where m.business_id = p_business and m.user_id = auth.uid() and m.active and m.role = 'BARBER';
  if auth.uid() is null or v_m is null then raise exception 'Solo los barberos del negocio pueden pedir cobrar.'; end if;
  if p_days is null or cardinality(p_days) = 0 then raise exception 'Elegí al menos un día.'; end if;
  if cardinality(p_days) > 31 then raise exception 'Podés pedir hasta 31 días juntos.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_m::text));
  for v_day in select distinct d from unnest(p_days) d order by d loop
    if v_day > private.ar_today() then raise exception 'No se puede pedir cobrar un día futuro.'; end if;
    if v_day < private.ar_today() - 90 then raise exception 'Solo se pueden pedir los últimos 90 días.'; end if;
    if private.comision_del_dia(v_m, v_day) <= 0 then
      raise exception 'El día % no tiene comisión para cobrar.', to_char(v_day, 'DD/MM');
    end if;
    select status into v_status from public.payout_days where barber_membership_id = v_m and day = v_day;
    if v_status is null then
      insert into public.payout_days (business_id, barber_membership_id, day, status) values (p_business, v_m, v_day, 'REQUESTED');
      v_n := v_n + 1;
    elsif v_status = 'REJECTED' then
      update public.payout_days set status = 'REQUESTED', requested_at = now(), decided_at = null, decided_by = null, reject_reason = null
       where barber_membership_id = v_m and day = v_day;
      v_n := v_n + 1;
    elsif v_status = 'PAID' then
      raise exception 'El día % ya está cobrado.', to_char(v_day, 'DD/MM');
    end if;   -- REQUESTED: ya estaba pedido, no se duplica
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Dueño o encargado acepta o rechaza. También puede marcar como cobrado un día que el barbero no pidió.
-- Devuelve la plata total entregada (al rechazar, 0).
-- ---------------------------------------------------------------------------
create function public.decide_payout(p_business uuid, p_membership uuid, p_days date[], p_accept boolean, p_reason text default null)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date;
  v_row public.payout_days%rowtype;
  v_amount bigint;
  v_adj bigint;
  v_total bigint;
  v_sum bigint := 0;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para decidir cobros.';
  end if;
  if not exists (select 1 from public.memberships m where m.id = p_membership and m.business_id = p_business and m.role = 'BARBER') then
    raise exception 'La persona indicada no es un barbero de este negocio.';
  end if;
  if p_days is null or cardinality(p_days) = 0 then raise exception 'Elegí al menos un día.'; end if;
  if cardinality(p_days) > 31 then raise exception 'Se pueden decidir hasta 31 días juntos.'; end if;
  if not p_accept and (v_reason is null or char_length(v_reason) < 3) then raise exception 'Indicá el motivo del rechazo.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_membership::text));
  for v_day in select distinct d from unnest(p_days) d order by d loop
    select * into v_row from public.payout_days where barber_membership_id = p_membership and day = v_day;
    if p_accept then
      if v_row.status = 'PAID' then raise exception 'El día % ya está cobrado.', to_char(v_day, 'DD/MM'); end if;
      v_amount := private.comision_del_dia(p_membership, v_day);
      if v_amount <= 0 then raise exception 'El día % no tiene comisión para cobrar.', to_char(v_day, 'DD/MM'); end if;
      v_adj := private.ajuste_de_cobros(p_membership);          -- se calcula antes de sumar este día
      v_total := greatest(v_amount + v_adj, 0);
      if v_row.id is null then
        insert into public.payout_days (business_id, barber_membership_id, day, status, decided_at, decided_by, day_amount, paid_total)
        values (p_business, p_membership, v_day, 'PAID', now(), auth.uid(), v_amount, v_total);
      else
        update public.payout_days set status = 'PAID', decided_at = now(), decided_by = auth.uid(), reject_reason = null,
               day_amount = v_amount, paid_total = v_total
         where id = v_row.id;
      end if;
      v_sum := v_sum + v_total;
    else
      if v_row.status is distinct from 'REQUESTED' then raise exception 'El día % no tiene un pedido pendiente.', to_char(v_day, 'DD/MM'); end if;
      update public.payout_days set status = 'REJECTED', decided_at = now(), decided_by = auth.uid(), reject_reason = v_reason
       where id = v_row.id;
    end if;
  end loop;
  return v_sum;
end $$;

-- ---------------------------------------------------------------------------
-- Lectura: un renglón por barbero y día con ventas o con pedido. Respeta RLS (el barbero ve solo lo suyo).
-- ---------------------------------------------------------------------------
create function public.dias_cobro(p_business uuid, p_desde date, p_hasta date)
returns table (
  barber_membership_id uuid, dia date, cantidad bigint, vendido bigint, comision bigint,
  estado text, monto_cobrado integer, entregado integer, motivo text
)
language sql stable security invoker set search_path = ''
as $$
  with v as (
    select s.barber_membership_id as m, private.ar_day(s.sold_at) as d, count(*) as c, sum(s.amount)::bigint as t,
           coalesce(sum(s.barber_amount) filter (
             where s.commission_model = 'PERCENT' and not exists (select 1 from public.settlement_sales ss where ss.sale_id = s.id)
           ), 0)::bigint as k
      from public.sales s
     where s.business_id = p_business and s.status = 'VALID'
       and s.sold_at >= private.ar_day_start(p_desde) and s.sold_at < private.ar_day_start(p_hasta + 1)
     group by 1, 2
  )
  select coalesce(v.m, p.barber_membership_id), coalesce(v.d, p.day), coalesce(v.c, 0), coalesce(v.t, 0), coalesce(v.k, 0),
         coalesce(p.status, 'SIN_PEDIR'), p.day_amount, p.paid_total, p.reject_reason
    from v
    full join (select * from public.payout_days where business_id = p_business and day between p_desde and p_hasta) p
      on p.barber_membership_id = v.m and p.day = v.d
   where p_hasta - p_desde <= 400
   order by 2 desc, 1;
$$;

-- Ajuste pendiente por barbero (ver private.ajuste_de_cobros). El barbero ve solo el suyo.
create function public.ajuste_cobros(p_business uuid)
returns table (barber_membership_id uuid, ajuste bigint)
language sql stable security definer set search_path = ''
as $$
  select m.id, private.ajuste_de_cobros(m.id)
    from public.memberships m
   where m.business_id = p_business and m.role = 'BARBER'
     and (private.has_role(p_business, array['OWNER','MANAGER']::public.business_role[]) or (m.user_id = auth.uid() and m.active))
$$;

revoke all on function public.request_payout(uuid, date[]), public.decide_payout(uuid, uuid, date[], boolean, text),
  public.dias_cobro(uuid, date, date), public.ajuste_cobros(uuid) from public, anon;
grant execute on function public.request_payout(uuid, date[]), public.decide_payout(uuid, uuid, date[], boolean, text),
  public.dias_cobro(uuid, date, date), public.ajuste_cobros(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Solo el DUEÑO puede anular ventas (antes también el encargado). Una venta de un día ya cobrado se puede anular:
-- el cobro queda como estaba y la diferencia se descuenta en el próximo cobro del barbero.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_sale(p_sale uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
begin
  select * into v_sale from public.sales where id = p_sale;
  if not found or not private.has_role(v_sale.business_id, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede anular ventas.';
  end if;
  if v_sale.status = 'CANCELED' then raise exception 'La venta ya estaba anulada.'; end if;
  if exists (select 1 from public.settlement_sales ss where ss.sale_id = p_sale) then
    raise exception 'Esta venta ya fue incluida en una liquidación de comisiones anterior y no se puede anular.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Indicá el motivo de la anulación.';
  end if;
  update public.sales
     set status = 'CANCELED', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_sale;
end $$;
