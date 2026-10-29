-- Pruebas de agenda, clientes, metas, horarios y montos fijos.
-- Requiere haber aplicado las migraciones 1 a 7 (en un Postgres local con 00_simular_supabase.sql).
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

-- ===== Dueño: configura comisiones y, al principio, SIN módulos =====
set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false) \gset
update public.memberships set commission_model='PERCENT', commission_bps=5000, commission_configured=true where id = current_setting('test.b1')::uuid;
update public.memberships set commission_model='CHAIR_RENT', commission_bps=0, commission_configured=true, fixed_monthly=80000 where id = current_setting('test.b2')::uuid;
select pg_temp.esperar('Con la agenda apagada no se puede agendar',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.own')::uuid, pg_temp.lunes(10,0), gen_random_uuid())$q$));
select pg_temp.esperar('Con clientes apagado no se puede crear un cliente',
  pg_temp.falla($q$insert into public.clients (business_id,name) values (current_setting('test.g')::uuid,'Juan')$q$));
select public.save_modules(current_setting('test.g')::uuid, array['AGENDA','CLIENTES']::public.business_module[], true);

-- Monto fijo y fijos mensuales
select pg_temp.esperar('Dueño carga alquiler de silla fijo', pg_temp.n($q$select alquiler_silla from public.fijos_mensuales(current_setting('test.g')::uuid)$q$) = 80000);
update public.memberships set commission_model='SALARY', commission_bps=0, commission_configured=true, fixed_monthly=300000 where id = current_setting('test.mgr')::uuid;
select pg_temp.esperar('Sueldo fijo se suma aparte', pg_temp.n($q$select sueldos from public.fijos_mensuales(current_setting('test.g')::uuid)$q$) = 300000);
select pg_temp.esperar('Monto fijo negativo se rechaza',
  pg_temp.falla($q$update public.memberships set fixed_monthly = -1 where id = current_setting('test.b2')::uuid$q$));

-- Metas
select public.set_goal(current_setting('test.g')::uuid, null, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 2000000);
select pg_temp.esperar('Dueño fija la meta del negocio', pg_temp.n('select count(*) from public.sales_goals where barber_membership_id is null') = 1);
select public.set_goal(current_setting('test.g')::uuid, null, (now() at time zone 'America/Argentina/Buenos_Aires')::date + 3, 2500000);
select pg_temp.esperar('Repetir el mes reemplaza la meta (no duplica)',
  pg_temp.n('select count(*) from public.sales_goals where barber_membership_id is null') = 1
  and pg_temp.n('select amount from public.sales_goals where barber_membership_id is null') = 2500000);
select public.set_goal(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, now()::date, 600000);
select pg_temp.esperar('Dueño fija la meta de un barbero', pg_temp.n('select count(*) from public.sales_goals') = 2);
select pg_temp.esperar('La meta se guarda al primer día del mes',
  pg_temp.n($q$select count(*) from public.sales_goals where month <> date_trunc('month', month)::date$q$) = 0);
select pg_temp.esperar('Meta negativa se rechaza',
  pg_temp.falla($q$select public.set_goal(current_setting('test.g')::uuid, null, now()::date, -5)$q$));
select pg_temp.esperar('No se fija meta para un barbero de otro negocio',
  pg_temp.falla($q$select public.set_goal(current_setting('test.h')::uuid, current_setting('test.b1')::uuid, now()::date, 100)$q$));
select pg_temp.esperar('No se escribe directo en metas',
  pg_temp.falla($q$update public.sales_goals set amount = 1$q$));

-- Clientes (dueño)
insert into public.clients (business_id,name,phone,notes) values (current_setting('test.g')::uuid,'Juan Pérez','+54 11 5555-1234','Prefiere degradé');
select id as cli from public.clients where name='Juan Pérez' \gset
select set_config('test.cli',:'cli',false) \gset
select pg_temp.esperar('Dueño crea un cliente', pg_temp.n('select count(*) from public.clients') = 1);
select pg_temp.esperar('Teléfono inválido se rechaza',
  pg_temp.falla($q$insert into public.clients (business_id,name,phone) values (current_setting('test.g')::uuid,'X','abc')$q$));
select pg_temp.esperar('Nombre vacío se rechaza',
  pg_temp.falla($q$insert into public.clients (business_id,name) values (current_setting('test.g')::uuid,'   ')$q$));
select pg_temp.esperar('No se crea un cliente en otro negocio',
  pg_temp.falla($q$insert into public.clients (business_id,name) values (current_setting('test.h')::uuid,'Intruso')$q$));

-- Horarios: encargado carga lunes a viernes 09-18 para el barbero 1
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',false) \gset
select public.save_working_hours(current_setting('test.g')::uuid, current_setting('test.b1')::uuid,
  '[{"weekday":1,"start":"09:00","end":"18:00"},{"weekday":2,"start":"09:00","end":"18:00"},{"weekday":3,"start":"09:00","end":"18:00"},{"weekday":4,"start":"09:00","end":"18:00"},{"weekday":5,"start":"09:00","end":"18:00"}]');
select pg_temp.esperar('Encargado carga horarios', pg_temp.n('select count(*) from public.working_hours') = 5);
select pg_temp.esperar('Horario con fin anterior al inicio se rechaza',
  pg_temp.falla($q$select public.save_working_hours(current_setting('test.g')::uuid, current_setting('test.b2')::uuid, '[{"weekday":1,"start":"18:00","end":"09:00"}]')$q$));
select pg_temp.esperar('Horario con día inválido se rechaza',
  pg_temp.falla($q$select public.save_working_hours(current_setting('test.g')::uuid, current_setting('test.b2')::uuid, '[{"weekday":9,"start":"09:00","end":"10:00"}]')$q$));
select pg_temp.esperar('Horarios que no son una lista se rechazan',
  pg_temp.falla($q$select public.save_working_hours(current_setting('test.g')::uuid, current_setting('test.b2')::uuid, '{"a":1}')$q$));
select pg_temp.esperar('Un horario inválido no borra los anteriores', pg_temp.n('select count(*) from public.working_hours') = 5);
select pg_temp.esperar('Encargado agenda para el dueño sin restricción de horario (sin horarios cargados)',
  public.create_appointment(current_setting('test.g')::uuid, current_setting('test.own')::uuid, pg_temp.lunes(20,0), gen_random_uuid()) is not null);

-- ===== Barbero 1 =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',false) \gset
select set_config('test.k1', gen_random_uuid()::text, false) \gset
select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,0), current_setting('test.k1')::uuid, null, current_setting('test.svc2')::uuid, current_setting('test.cli')::uuid);
select pg_temp.esperar('Barbero agenda su turno', pg_temp.n($q$select count(*) from public.appointments where barber_membership_id = current_setting('test.b1')::uuid$q$) = 1);
select pg_temp.esperar('La duración sale del servicio (45 min)',
  pg_temp.n($q$select extract(epoch from ends_at - starts_at)::bigint / 60 from public.appointments where barber_membership_id = current_setting('test.b1')::uuid$q$) = 45);
select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,0), current_setting('test.k1')::uuid);
select pg_temp.esperar('Repetir la misma clave no duplica el turno', pg_temp.n($q$select count(*) from public.appointments where barber_membership_id = current_setting('test.b1')::uuid$q$) = 1);
select pg_temp.esperar('Un turno que se superpone se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,30), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('Un turno pegado al anterior (sin superponer) se acepta',
  public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,45), gen_random_uuid(), 30) is not null);
select pg_temp.esperar('Horario que no es de 15 en 15 se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(12,10), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('Duración que no es múltiplo de 15 se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(12,0), gen_random_uuid(), 20)$q$));
select pg_temp.esperar('Turno fuera del horario de trabajo (sábado) se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,0,5), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('Turno que termina después del cierre se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(17,45), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('Turno en el pasado lejano se rechaza',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, date_trunc('hour', now()) - interval '3 days', gen_random_uuid(), 30)$q$));
select pg_temp.esperar('Barbero NO agenda por otro barbero',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b2')::uuid, pg_temp.lunes(10,0), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('No se agenda en otro negocio',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.h')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,0), gen_random_uuid(), 30)$q$));
select pg_temp.esperar('No se usa un cliente de otro negocio... ni inexistente',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(14,0), gen_random_uuid(), 30, null, gen_random_uuid())$q$));
select pg_temp.esperar('No se inserta turno directo', pg_temp.falla($q$insert into public.appointments (business_id,barber_membership_id,starts_at,ends_at,created_by,idempotency_key) values (current_setting('test.g')::uuid,current_setting('test.b1')::uuid,now(),now()+interval '1 hour',auth.uid(),gen_random_uuid())$q$));
select pg_temp.esperar('No se edita un turno directo', pg_temp.falla($q$update public.appointments set status='PAID'$q$));
select pg_temp.esperar('No se borra un turno', pg_temp.falla($q$delete from public.appointments$q$));
select pg_temp.esperar('Barbero ve solo sus turnos', pg_temp.n('select count(*) from public.appointments') = 2);
select pg_temp.esperar('Barbero ve solo sus horarios', pg_temp.n('select count(*) from public.working_hours') = 5);
select pg_temp.esperar('Barbero NO cambia horarios',
  pg_temp.falla($q$select public.save_working_hours(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, '[]')$q$));
select pg_temp.esperar('Barbero NO fija metas',
  pg_temp.falla($q$select public.set_goal(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, now()::date, 1)$q$));
select pg_temp.esperar('Barbero ve solo SU meta, no la del negocio',
  pg_temp.n('select count(*) from public.sales_goals') = 1);
update public.memberships set fixed_monthly = 1 where id = current_setting('test.b1')::uuid;
select pg_temp.esperar('Barbero NO cambia su monto fijo', pg_temp.n($q$select count(*) from public.memberships where id = current_setting('test.b1')::uuid and fixed_monthly = 0$q$) = 1);

-- Terminar, cobrar y cancelar
select id as t1 from public.appointments where starts_at = pg_temp.lunes(10,0) and barber_membership_id = current_setting('test.b1')::uuid \gset
select id as t2 from public.appointments where starts_at = pg_temp.lunes(10,45) and barber_membership_id = current_setting('test.b1')::uuid \gset
select set_config('test.t1',:'t1',false), set_config('test.t2',:'t2',false) \gset
select public.finish_appointment(current_setting('test.t1')::uuid);
select pg_temp.esperar('Terminar el turno lo deja pendiente de cobro', pg_temp.n($q$select count(*) from public.appointments where status='DONE'$q$) = 1);
select pg_temp.esperar('Terminar el turno NO crea una venta', pg_temp.n('select count(*) from public.sales') = 0);
select pg_temp.esperar('No se termina dos veces', pg_temp.falla($q$select public.finish_appointment(current_setting('test.t1')::uuid)$q$));
select set_config('test.kc', gen_random_uuid()::text, false) \gset
select public.charge_appointment(current_setting('test.t1')::uuid, 15000, 'EFECTIVO', current_setting('test.kc')::uuid);
select pg_temp.esperar('Cobrar crea la venta con la comisión del barbero (50%)',
  pg_temp.n('select count(*) from public.sales where amount = 15000 and barber_amount = 7500 and local_amount = 7500') = 1);
select pg_temp.esperar('La venta lleva el servicio y el cliente del turno',
  pg_temp.n($q$select count(*) from public.sales where service_name = 'Corte y barba' and client_id = current_setting('test.cli')::uuid$q$) = 1);
select pg_temp.esperar('El turno queda cobrado y vinculado a la venta',
  pg_temp.n($q$select count(*) from public.appointments where id = current_setting('test.t1')::uuid and status='PAID' and sale_id is not null$q$) = 1);
select public.charge_appointment(current_setting('test.t1')::uuid, 15000, 'EFECTIVO', gen_random_uuid());
select pg_temp.esperar('Cobrar dos veces no duplica la venta', pg_temp.n('select count(*) from public.sales') = 1);
select pg_temp.esperar('Cobrar con monto inválido se rechaza',
  pg_temp.falla($q$select public.charge_appointment(current_setting('test.t2')::uuid, 0, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Un turno cobrado no se cancela',
  pg_temp.falla($q$select public.cancel_appointment(current_setting('test.t1')::uuid, 'me arrepentí')$q$));
select pg_temp.esperar('Cancelar sin motivo se rechaza',
  pg_temp.falla($q$select public.cancel_appointment(current_setting('test.t2')::uuid, 'x')$q$));
select public.cancel_appointment(current_setting('test.t2')::uuid, null, true);
select pg_temp.esperar('Marcar "no vino" no pide motivo', pg_temp.n($q$select count(*) from public.appointments where status='NO_SHOW'$q$) = 1);
select pg_temp.esperar('Un turno que no vino no se cobra',
  pg_temp.falla($q$select public.charge_appointment(current_setting('test.t2')::uuid, 5000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Un turno liberado permite agendar de nuevo en ese horario',
  public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b1')::uuid, pg_temp.lunes(10,45), gen_random_uuid(), 30) is not null);

-- Clientes como barbero
insert into public.clients (business_id,name,phone) values (current_setting('test.g')::uuid,'María','1155551111');
select pg_temp.esperar('Barbero crea un cliente', pg_temp.n('select count(*) from public.clients') = 2);
select pg_temp.esperar('Barbero NO desactiva clientes',
  pg_temp.falla($q$update public.clients set active = false where name = 'María'$q$));
update public.clients set notes = 'Viene los viernes' where name = 'María';
select pg_temp.esperar('Barbero edita notas de un cliente', pg_temp.n($q$select count(*) from public.clients where notes = 'Viene los viernes'$q$) = 1);
select pg_temp.esperar('Barbero NO cambia el negocio de un cliente',
  pg_temp.falla($q$update public.clients set business_id = current_setting('test.h')::uuid where name = 'María'$q$));

-- ===== Barbero 2: no ve lo del barbero 1 =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000004',false) \gset
select pg_temp.esperar('Barbero 2 no ve turnos del barbero 1', pg_temp.n('select count(*) from public.appointments') = 0);
select pg_temp.esperar('Barbero 2 no ve horarios ajenos', pg_temp.n('select count(*) from public.working_hours') = 0);
select pg_temp.esperar('Barbero 2 no termina turnos ajenos',
  pg_temp.falla($q$select public.finish_appointment(current_setting('test.t1')::uuid)$q$));
select pg_temp.esperar('Barbero 2 no cancela turnos ajenos',
  pg_temp.falla($q$select public.cancel_appointment(current_setting('test.t1')::uuid, 'intento ajeno')$q$));
select pg_temp.esperar('Barbero 2 no cobra turnos ajenos',
  pg_temp.falla($q$select public.charge_appointment(current_setting('test.t1')::uuid, 100, 'EFECTIVO', gen_random_uuid())$q$));

-- ===== Encargado: ve todo, puede terminar turnos ajenos y desactivar clientes =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Encargado ve todos los turnos', pg_temp.n('select count(*) from public.appointments') = 4);
update public.clients set active = false where name = 'María';
select pg_temp.esperar('Encargado desactiva un cliente', pg_temp.n($q$select count(*) from public.clients where name = 'María' and not active$q$) = 1);
select pg_temp.esperar('El cliente desactivado ya no se puede usar en un turno',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.b2')::uuid, pg_temp.lunes(15,0), gen_random_uuid(), 30, null, (select id from public.clients where name='María'))$q$));
select pg_temp.esperar('Encargado NO fija metas',
  pg_temp.falla($q$select public.set_goal(current_setting('test.g')::uuid, null, now()::date, 1)$q$));
select pg_temp.esperar('Encargado ve todas las metas', pg_temp.n('select count(*) from public.sales_goals') = 2);

-- Resumen por servicio
select pg_temp.esperar('Resumen por servicio suma lo vendido',
  pg_temp.n($q$select vendido from public.resumen_por_servicio(current_setting('test.g')::uuid, now() - interval '1 day', now() + interval '1 hour') where service_name = 'Corte y barba'$q$) = 15000);

-- ===== Otro negocio: aislamiento total =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Otro negocio no ve turnos', pg_temp.n('select count(*) from public.appointments') = 0);
select pg_temp.esperar('Otro negocio no ve clientes', pg_temp.n('select count(*) from public.clients') = 0);
select pg_temp.esperar('Otro negocio no ve metas ni horarios', pg_temp.n('select count(*) from public.sales_goals') + pg_temp.n('select count(*) from public.working_hours') = 0);
select pg_temp.esperar('Otro negocio no cobra turnos ajenos',
  pg_temp.falla($q$select public.charge_appointment(current_setting('test.t1')::uuid, 100, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Otro negocio no usa clientes ajenos al vender',
  pg_temp.falla($q$select public.register_sale(current_setting('test.h')::uuid, (select id from public.memberships where user_id=auth.uid()), 1000, 'EFECTIVO', gen_random_uuid(), null, now(), null, current_setting('test.cli')::uuid)$q$));

-- ===== Módulo apagado: lo existente deja de verse =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',false) \gset
select public.save_modules(current_setting('test.g')::uuid, array[]::public.business_module[]);
select pg_temp.esperar('Con la agenda apagada los turnos no se ven (pero no se borran)', pg_temp.n('select count(*) from public.appointments') = 0);
select pg_temp.esperar('Con clientes apagado la lista queda oculta', pg_temp.n('select count(*) from public.clients') = 0);
select pg_temp.esperar('Con la agenda apagada no se puede terminar ni agendar',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.own')::uuid, pg_temp.lunes(11,0,1), gen_random_uuid(), 30)$q$));
select public.save_modules(current_setting('test.g')::uuid, array['AGENDA','CLIENTES']::public.business_module[]);
select pg_temp.esperar('Al volver a encenderla reaparece todo', pg_temp.n('select count(*) from public.appointments') = 4);

-- ===== Anónimo =====
reset role; set role anon;
select pg_temp.esperar('Anónimo NO lee turnos', pg_temp.falla('select count(*) from public.appointments'));
select pg_temp.esperar('Anónimo NO lee clientes', pg_temp.falla('select count(*) from public.clients'));
select pg_temp.esperar('Anónimo NO lee metas', pg_temp.falla('select count(*) from public.sales_goals'));
select pg_temp.esperar('Anónimo NO agenda',
  pg_temp.falla($q$select public.create_appointment(current_setting('test.g')::uuid, current_setting('test.own')::uuid, pg_temp.lunes(11,0), gen_random_uuid())$q$));
reset role;
\echo TODAS LAS PRUEBAS DE AGENDA, CLIENTES Y METAS PASARON
