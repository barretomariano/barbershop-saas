-- Pruebas de editar turnos (migración 10). Requiere migraciones 1 a 10 en un Postgres local con 00_simular_supabase.sql.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.esperar(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin if p_ok then raise notice 'OK     %', p_nombre; else raise exception 'FALLO  %', p_nombre; end if; end $$;
create or replace function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql into r; return r; end $$;
create or replace function pg_temp.falla(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
-- Próximo lunes a las H:M (hora argentina) como instante absoluto; d suma días.
create or replace function pg_temp.lunes(h int, m int, d int default 0) returns timestamptz language sql as $$
  select ((date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires') + interval '7 days'
          + make_interval(days => d, hours => h, mins => m)) at time zone 'America/Argentina/Buenos_Aires') $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id) values
 ('a1000000-0000-0000-0000-000000000001'),('a1000000-0000-0000-0000-000000000002'),
 ('a1000000-0000-0000-0000-000000000003'),('a1000000-0000-0000-0000-000000000004'),
 ('b1000000-0000-0000-0000-000000000001');
select private.admin_create_business('Barbería G','a1000000-0000-0000-0000-000000000001','Owner G') as biz_g \gset
select private.admin_create_business('Barbería H','b1000000-0000-0000-0000-000000000001','Owner H') as biz_h \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_g','a1000000-0000-0000-0000-000000000002','MANAGER','Manager G'),
 (:'biz_g','a1000000-0000-0000-0000-000000000003','BARBER','Barbero G1'),
 (:'biz_g','a1000000-0000-0000-0000-000000000004','BARBER','Barbero G2');
select set_config('test.g',:'biz_g',false), set_config('test.h',:'biz_h',false) \gset
select id as m_own from public.memberships where user_id='a1000000-0000-0000-0000-000000000001' \gset
select id as m_mgr from public.memberships where user_id='a1000000-0000-0000-0000-000000000002' \gset
select id as m_b1 from public.memberships where user_id='a1000000-0000-0000-0000-000000000003' \gset
select id as m_b2 from public.memberships where user_id='a1000000-0000-0000-0000-000000000004' \gset
select set_config('test.own',:'m_own',false), set_config('test.mgr',:'m_mgr',false),
       set_config('test.b1',:'m_b1',false), set_config('test.b2',:'m_b2',false) \gset
-- Servicios (se cargan como administración, antes de entrar como usuario)
insert into public.services (business_id,name,default_price,duration_minutes) values
 (:'biz_g','Corte',10000,30),(:'biz_g','Corte y barba',15000,45);
select id as svc from public.services where name='Corte' \gset
select id as svc2 from public.services where name='Corte y barba' \gset
select set_config('test.svc',:'svc',false), set_config('test.svc2',:'svc2',false) \gset

set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false) \gset
update public.memberships set commission_model='PERCENT', commission_bps=5000, commission_configured=true where id in (current_setting('test.b1')::uuid, current_setting('test.b2')::uuid);
select public.save_modules(current_setting('test.g')::uuid, array['AGENDA']::public.business_module[], true);

-- El barbero 1 agenda dos turnos
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',false) \gset
select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,0), gen_random_uuid(), 30, current_setting('test.svc')::uuid, null, 'Ana', null) as t1 \gset
select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(11,0), gen_random_uuid(), 30, null, null, 'Beto', null) as t2 \gset

select public.update_appointment(:'t1', pg_temp.lunes(10,15), 45, current_setting('test.b1')::uuid, current_setting('test.svc2')::uuid, null, 'Ana', 'llegó tarde');
select pg_temp.esperar('Se puede correr la hora y cambiar el servicio',
  pg_temp.n($q$select count(*) from public.appointments where service_name='Corte y barba' and note='llegó tarde' and ends_at - starts_at = interval '45 minutes'$q$) = 1);
select pg_temp.esperar('No se puede superponer con otro turno del mismo barbero',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(10,45), 30, current_setting('test.b1')::uuid, null, null, 'Ana', null)$q$, :'t1')));
select pg_temp.esperar('Duración inválida se rechaza',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(10,15), 20, current_setting('test.b1')::uuid, null, null, 'Ana', null)$q$, :'t1')));
select pg_temp.esperar('Horario fuera de bloques de 15 se rechaza',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(10,10), 30, current_setting('test.b1')::uuid, null, null, 'Ana', null)$q$, :'t1')));
select pg_temp.esperar('Un barbero no puede pasarle el turno a otro barbero',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(10,15), 30, current_setting('test.b2')::uuid, null, null, 'Ana', null)$q$, :'t1')));

-- Otro barbero no puede editar turnos ajenos
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',false) \gset
select pg_temp.esperar('Otro barbero no edita turnos ajenos',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(12,0), 30, current_setting('test.b1')::uuid, null, null, 'Ana', null)$q$, :'t1')));

-- El encargado sí puede reasignar
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',false) \gset
select public.update_appointment(:'t2', pg_temp.lunes(11,0), 30, current_setting('test.b2')::uuid, null, null, 'Beto', null);
select pg_temp.esperar('El encargado reasigna el turno a otro barbero',
  pg_temp.n(format($q$select count(*) from public.appointments where id=%L and barber_membership_id=current_setting('test.b2')::uuid$q$, :'t2')) = 1);

-- Turnos cancelados no se editan
select public.cancel_appointment(:'t2', 'no puede', false);
select pg_temp.esperar('Un turno cancelado no se edita',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(13,0), 30, current_setting('test.b2')::uuid, null, null, 'Beto', null)$q$, :'t2')));

-- Usuario de otro negocio
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Otro negocio no puede editar',
  pg_temp.falla(format($q$select public.update_appointment(%L, pg_temp.lunes(13,0), 30, current_setting('test.b1')::uuid, null, null, 'X', null)$q$, :'t1')));
\echo TODO OK
