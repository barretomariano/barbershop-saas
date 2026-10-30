-- Editar un turno programado: cambiar hora, duración, barbero, servicio, cliente o nota sin cancelarlo.
-- Sirve cuando el cliente llega tarde o reagenda. Solo se editan turnos PROGRAMADOS (los terminados,
-- cobrados o cancelados quedan como están, para no alterar el historial ni las ventas).
-- Se vuelven a aplicar las mismas reglas que al crear: permisos, bloques de 15 minutos, horario de trabajo
-- y que no se superponga con otro turno del mismo barbero.

create function public.update_appointment(
  p_appointment uuid,
  p_starts_at timestamptz,
  p_duration_minutes integer,
  p_barber_membership uuid,
  p_service uuid default null,
  p_client uuid default null,
  p_client_name text default null,
  p_note text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v public.appointments%rowtype;
  v_service public.services%rowtype;
  v_ends timestamptz;
  v_ls timestamp;
  v_le timestamp;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para editar turnos.'; end if;

  select * into v from public.appointments where id = p_appointment for update;
  if not found or not private.is_member(v.business_id) then raise exception 'No tenés permiso para cambiar este turno.'; end if;
  if not private.module_enabled(v.business_id, 'AGENDA') then raise exception 'La agenda no está activada en este negocio.'; end if;
  if not private.can_manage_appointment(v.business_id, v.barber_membership_id) then
    raise exception 'No tenés permiso para cambiar este turno.';
  end if;
  if v.status <> 'SCHEDULED' then raise exception 'Solo se pueden editar turnos programados.'; end if;

  if not exists (select 1 from public.memberships m where m.id = p_barber_membership and m.business_id = v.business_id and m.active) then
    raise exception 'La persona indicada no existe en este negocio.';
  end if;
  if not private.can_manage_appointment(v.business_id, p_barber_membership) then
    raise exception 'Un barbero solo puede agendar sus propios turnos.';
  end if;

  if p_service is not null then
    select * into v_service from public.services s
     where s.id = p_service and s.business_id = v.business_id and (s.active or s.id = v.service_id);
    if not found then raise exception 'El servicio no existe o está inactivo.'; end if;
  end if;
  if p_client is not null and not exists (
    select 1 from public.clients c where c.id = p_client and c.business_id = v.business_id and (c.active or c.id = v.client_id)
  ) then
    raise exception 'El cliente no existe o está inactivo.';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 15 or p_duration_minutes > 480 or p_duration_minutes % 15 <> 0 then
    raise exception 'La duración debe ser de entre 15 minutos y 8 horas, en bloques de 15 minutos.';
  end if;
  if date_trunc('minute', p_starts_at) <> p_starts_at or extract(minute from p_starts_at)::integer % 15 <> 0 then
    raise exception 'El turno debe empezar en un horario de bloques de 15 minutos (00, 15, 30 o 45).';
  end if;
  v_ends := p_starts_at + make_interval(mins => p_duration_minutes);

  -- Los límites de fecha y el horario de trabajo solo se controlan si cambió el horario o el barbero.
  if p_starts_at <> v.starts_at or p_barber_membership <> v.barber_membership_id then
    if p_starts_at < now() - interval '1 day' then raise exception 'El turno no puede empezar hace más de un día.'; end if;
    if p_starts_at > now() + interval '180 days' then raise exception 'El turno no puede ser a más de 180 días.'; end if;
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
  end if;

  begin
    update public.appointments
       set starts_at = p_starts_at, ends_at = v_ends, barber_membership_id = p_barber_membership,
           service_id = v_service.id, service_name = case when p_service is null then null else v_service.name end,
           client_id = p_client, client_name = case when p_client is null then nullif(btrim(p_client_name), '') else null end,
           note = nullif(btrim(p_note), ''), status_changed_at = now()
     where id = p_appointment;
  exception when exclusion_violation then
    raise exception 'Ese horario se superpone con otro turno de esta persona.';
  end;
end $$;

revoke all on function public.update_appointment(uuid, timestamptz, integer, uuid, uuid, uuid, text, text) from public, anon;
grant execute on function public.update_appointment(uuid, timestamptz, integer, uuid, uuid, uuid, text, text) to authenticated;
