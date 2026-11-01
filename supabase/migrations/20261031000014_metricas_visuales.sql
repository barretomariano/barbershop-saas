-- Rediseño, etapas 2 a 5: datos para los gráficos nuevos (mapa de horarios, recurrencia de clientes,
-- gastos por día y rentabilidad por servicio). Todas corren con los permisos de quien llama (security invoker):
-- un barbero solo ve lo suyo, y solo dueño y encargado ven los gastos. Solo cuentan ventas y gastos VÁLIDOS.
-- Zona horaria de todos los cortes: America/Argentina/Buenos_Aires.

-- 1. Mapa de calor: ventas por día de la semana (0 = lunes ... 6 = domingo) y hora.
create function public.mapa_calor(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (dia_semana integer, hora integer, cantidad bigint, vendido bigint)
language sql stable security invoker set search_path = ''
as $$
  select (extract(isodow from s.sold_at at time zone 'America/Argentina/Buenos_Aires')::integer - 1),
         extract(hour from s.sold_at at time zone 'America/Argentina/Buenos_Aires')::integer,
         count(*), sum(s.amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by 1, 2 order by 1, 2;
$$;

-- 2. Recurrencia de clientes. En el período: cuántos clientes con ficha compraron, cuántos vinieron en 2 o más
-- días distintos, y cada cuántos días vuelven en promedio. "Dormidos": clientes que ya vinieron en 2 o más días
-- distintos (en todo el historial) y no vuelven hace más de 45 días.
create function public.recurrencia_clientes(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (con_cliente bigint, recurrentes bigint, intervalo_dias numeric, dormidos bigint)
language sql stable security invoker set search_path = ''
as $$
  with visitas as (
    select s.client_id, (s.sold_at at time zone 'America/Argentina/Buenos_Aires')::date as d, s.sold_at
      from public.sales s
     where s.business_id = p_business and s.status = 'VALID' and s.client_id is not null
     group by s.client_id, 2, s.sold_at
  ),
  dias as (select distinct client_id, d from visitas),
  periodo as (
    select client_id, count(*) as n,
           case when count(*) > 1 then (max(d) - min(d))::numeric / (count(*) - 1) end as intervalo
      from (select distinct v.client_id, v.d from visitas v where v.sold_at >= p_desde and v.sold_at < p_hasta) x
     group by client_id
  ),
  historia as (select client_id, count(*) as n, max(d) as ultima from dias group by client_id)
  select (select count(*) from periodo),
         (select count(*) from periodo where n > 1),
         (select round(avg(intervalo), 1) from periodo),
         (select count(*) from historia
           where n >= 2 and ultima < (now() at time zone 'America/Argentina/Buenos_Aires')::date - 45);
$$;

-- 3. Gastos por día (para comparar con lo que entra).
create function public.serie_gastos(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (dia date, total bigint)
language sql stable security invoker set search_path = ''
as $$
  select (e.spent_at at time zone 'America/Argentina/Buenos_Aires')::date, sum(e.amount)::bigint
    from public.expenses e
   where e.business_id = p_business and e.status = 'VALID' and e.spent_at >= p_desde and e.spent_at < p_hasta
   group by 1 order by 1;
$$;

-- 4. Rentabilidad por servicio: cuánto se vende y cuánto le queda al local de cada uno.
create function public.rentabilidad_servicios(p_business uuid, p_desde timestamptz, p_hasta timestamptz)
returns table (service_name text, cantidad bigint, vendido bigint, para_local bigint)
language sql stable security invoker set search_path = ''
as $$
  select coalesce(s.service_name, 'Sin servicio'), count(*), sum(s.amount)::bigint, sum(s.local_amount)::bigint
    from public.sales s
   where s.business_id = p_business and s.status = 'VALID' and s.sold_at >= p_desde and s.sold_at < p_hasta
   group by coalesce(s.service_name, 'Sin servicio')
   order by 4 desc;
$$;

revoke all on function public.mapa_calor(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.recurrencia_clientes(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.serie_gastos(uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.rentabilidad_servicios(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.mapa_calor(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.recurrencia_clientes(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.serie_gastos(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.rentabilidad_servicios(uuid, timestamptz, timestamptz) to authenticated;
