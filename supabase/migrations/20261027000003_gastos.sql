-- Etapa 5: gastos del negocio (alquiler, insumos, servicios, sueldos, impuestos, otros).
-- Mismas reglas que las ventas: se registran solo con register_expense (monto validado en la base),
-- no se editan ni se borran: se anulan con motivo. Solo OWNER y MANAGER pueden verlos y cargarlos.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete restrict,
  category text not null check (category in ('ALQUILER','SERVICIOS','INSUMOS','SUELDOS','IMPUESTOS','OTROS')),
  description text check (description is null or char_length(description) <= 200),
  amount integer not null check (amount between 1 and 100000000),   -- ARS enteros
  spent_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  idempotency_key uuid not null,
  status public.sale_status not null default 'VALID',
  canceled_at timestamptz,
  canceled_by uuid references auth.users(id),
  cancel_reason text,
  unique (business_id, idempotency_key),
  check ((status = 'VALID' and canceled_at is null) or
         (status = 'CANCELED' and canceled_at is not null and cancel_reason is not null))
);

create index expenses_business_spent_idx on public.expenses (business_id, spent_at desc);

create function private.expenses_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los gastos no se pueden borrar. Anulá el gasto con cancel_expense.';
  end if;
  if (new.id, new.business_id, new.category, new.description, new.amount, new.spent_at,
      new.created_by, new.created_at, new.idempotency_key)
     is distinct from
     (old.id, old.business_id, old.category, old.description, old.amount, old.spent_at,
      old.created_by, old.created_at, old.idempotency_key) then
    raise exception 'Un gasto registrado no se puede modificar. Anulalo y cargá uno nuevo.';
  end if;
  if old.status = 'CANCELED' and new.status <> 'CANCELED' then
    raise exception 'Un gasto anulado no se puede reactivar.';
  end if;
  return new;
end $$;

create trigger expenses_immutable_trg before update or delete on public.expenses
for each row execute function private.expenses_immutable();

alter table public.expenses enable row level security;
alter table public.expenses force row level security;
revoke all on public.expenses from anon, authenticated;
grant select on public.expenses to authenticated;   -- escribir: solo vía register_expense / cancel_expense

create policy expenses_select on public.expenses for select to authenticated
  using (private.has_role(business_id, array['OWNER','MANAGER']::public.business_role[]));

create function public.register_expense(
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

create function public.cancel_expense(p_expense uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.expenses%rowtype;
begin
  select * into v from public.expenses where id = p_expense;
  if not found or not private.has_role(v.business_id, array['OWNER','MANAGER']::public.business_role[]) then
    raise exception 'No tenés permiso para anular este gasto.';
  end if;
  if v.status = 'CANCELED' then raise exception 'El gasto ya estaba anulado.'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'Indicá el motivo de la anulación.';
  end if;
  update public.expenses
     set status = 'CANCELED', canceled_at = now(), canceled_by = auth.uid(), cancel_reason = btrim(p_reason)
   where id = p_expense;
end $$;

revoke all on function public.register_expense(uuid, text, integer, uuid, text, timestamptz) from public, anon;
revoke all on function public.cancel_expense(uuid, text) from public, anon;
grant execute on function public.register_expense(uuid, text, integer, uuid, text, timestamptz) to authenticated;
grant execute on function public.cancel_expense(uuid, text) to authenticated;
