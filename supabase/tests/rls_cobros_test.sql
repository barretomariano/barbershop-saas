-- Pruebas de cobros por día (migración 16). Requiere migraciones 1 a 16 (Postgres local con 00_simular_supabase.sql).
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.esperar(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin if p_ok then raise notice 'OK     %', p_nombre; else raise exception 'FALLO  %', p_nombre; end if; end $$;
create or replace function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql into r; return r; end $$;
create or replace function pg_temp.falla(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id, email) values
 ('e1000000-0000-0000-0000-000000000001','o@x'),('e1000000-0000-0000-0000-000000000002','m@x'),
 ('e1000000-0000-0000-0000-000000000003','b1@x'),('e1000000-0000-0000-0000-000000000004','b2@x'),
 ('f1000000-0000-0000-0000-000000000001','o2@x');
select private.admin_create_business('Barbería P','e1000000-0000-0000-0000-000000000001','Dueño P') as biz \gset
select private.admin_create_business('Barbería Q','f1000000-0000-0000-0000-000000000001','Dueño Q') as biz_q \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz','e1000000-0000-0000-0000-000000000002','MANAGER','Encargado'),
 (:'biz','e1000000-0000-0000-0000-000000000003','BARBER','Barbero 1'),
 (:'biz','e1000000-0000-0000-0000-000000000004','BARBER','Barbero 2');
select id as m1 from public.memberships where user_id='e1000000-0000-0000-0000-000000000003' \gset
select id as m2 from public.memberships where user_id='e1000000-0000-0000-0000-000000000004' \gset
update public.memberships set commission_model='PERCENT', commission_bps=5000, commission_configured=true where id=:'m1';
update public.memberships set commission_model='CHAIR_RENT', commission_bps=0, commission_configured=true where id=:'m2';

-- ===== Ventas del barbero 1 (50%): hoy 10000, ayer 8000, anteayer 6000; el barbero 2 (alquiler) vende hoy 5000 =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',false) \gset
select public.register_sale(:'biz', :'m1', 10000, 'EFECTIVO', gen_random_uuid()) \gset
select public.register_sale(:'biz', :'m1', 8000, 'EFECTIVO', gen_random_uuid(), null, now() - interval '1 day') as v_ayer \gset
select public.register_sale(:'biz', :'m1', 6000, 'TRANSFERENCIA', gen_random_uuid(), null, now() - interval '2 days') \gset
select set_config('test.v_ayer', :'v_ayer', false) \gset
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',false) \gset
select public.register_sale(:'biz', :'m2', 5000, 'EFECTIVO', gen_random_uuid()) \gset

-- ===== Pedidos =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('El barbero ve su comisión de hoy (5000) y que todavía no pidió',
  (select comision = 5000 and estado = 'SIN_PEDIR' from public.dias_cobro(:'biz', private.ar_today(), private.ar_today()) where barber_membership_id = :'m1'));
select pg_temp.esperar('Pide cobrar hoy y ayer: 2 días pedidos',
  public.request_payout(:'biz', array[private.ar_today(), private.ar_today() - 1]) = 2);
select pg_temp.esperar('Repetir el pedido no duplica nada',
  public.request_payout(:'biz', array[private.ar_today()]) = 0);
select set_config('test.biz_x', :'biz', false) \gset
select pg_temp.esperar('No se puede pedir un día futuro',
  pg_temp.falla($q$select public.request_payout(current_setting('test.biz_x')::uuid, array[private.ar_today() + 1])$q$));
select pg_temp.esperar('No se puede pedir un día sin comisión',
  pg_temp.falla($q$select public.request_payout(current_setting('test.biz_x')::uuid, array[private.ar_today() - 5])$q$));
select pg_temp.esperar('No se puede pedir un día de más de 90 días',
  pg_temp.falla($q$select public.request_payout(current_setting('test.biz_x')::uuid, array[private.ar_today() - 95])$q$));
select pg_temp.esperar('El barbero no puede escribir directo en la tabla de cobros',
  pg_temp.falla($q$insert into public.payout_days (business_id, barber_membership_id, day, status) values (current_setting('test.biz_x')::uuid, (select id from public.memberships where user_id = auth.uid()), private.ar_today() - 2, 'REQUESTED')$q$));
select pg_temp.esperar('Ni aceptarse a sí mismo',
  pg_temp.falla($q$select public.decide_payout(current_setting('test.biz_x')::uuid, (select id from public.memberships where user_id = auth.uid()), array[private.ar_today()], true)$q$));

reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000004',false) \gset
select pg_temp.esperar('Barbero con alquiler de silla: no tiene comisión que cobrar',
  pg_temp.falla($q$select public.request_payout(current_setting('test.biz_x')::uuid, array[private.ar_today()])$q$));
select pg_temp.esperar('Un barbero NO ve los pedidos de otro',
  (select count(*) from public.payout_days) = 0);

reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('El dueño no puede "pedir cobrar" (no es barbero)',
  pg_temp.falla($q$select public.request_payout(current_setting('test.biz_x')::uuid, array[private.ar_today()])$q$));
select pg_temp.esperar('El dueño ve 2 pedidos pendientes',
  (select count(*) from public.payout_days where status = 'REQUESTED') = 2);

-- ===== Rechazo =====
select pg_temp.esperar('Rechazar exige motivo',
  pg_temp.falla($q$select public.decide_payout(current_setting('test.biz_x')::uuid, (select id from public.memberships where role='BARBER' and display_name='Barbero 1'), array[private.ar_today() - 1], false, '')$q$));
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',false) \gset
select public.decide_payout(:'biz', :'m1', array[private.ar_today() - 1], false, 'Falta cargar un corte');
select pg_temp.esperar('El encargado puede rechazar',
  (select status = 'REJECTED' and reject_reason = 'Falta cargar un corte' from public.payout_days where day = private.ar_today() - 1));

reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('El barbero ve el motivo del rechazo',
  (select estado = 'REJECTED' and motivo = 'Falta cargar un corte' from public.dias_cobro(:'biz', private.ar_today() - 1, private.ar_today() - 1) where barber_membership_id = :'m1'));
select pg_temp.esperar('Puede volver a pedir el día rechazado',
  public.request_payout(:'biz', array[private.ar_today() - 1]) = 1);

-- ===== Aceptación =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','f1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('El dueño de OTRA barbería no puede decidir',
  pg_temp.falla($q$select public.decide_payout(current_setting('test.biz_x')::uuid, (select id from public.memberships where display_name='Barbero 1'), array[private.ar_today()], true)$q$));
select pg_temp.esperar('Ni ve los cobros de otra barbería', (select count(*) from public.payout_days) = 0);

reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Aceptar hoy y ayer entrega 5000 + 4000 = 9000',
  public.decide_payout(:'biz', :'m1', array[private.ar_today(), private.ar_today() - 1], true) = 9000);
select pg_temp.esperar('Quedan cobrados con su monto',
  (select count(*) from public.payout_days where status = 'PAID' and paid_total = day_amount) = 2);
select pg_temp.esperar('Aceptar dos veces el mismo día falla',
  pg_temp.falla($q$select public.decide_payout(current_setting('test.biz_x')::uuid, (select id from public.memberships where display_name='Barbero 1'), array[private.ar_today()], true)$q$));
select pg_temp.esperar('No hay ajuste mientras nada cambie',
  (select ajuste = 0 from public.ajuste_cobros(:'biz') where barber_membership_id = :'m1'));

-- ===== Anulación de una venta de un día ya cobrado: solo el dueño =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('El encargado YA NO puede anular',
  pg_temp.falla($q$select public.cancel_sale(current_setting('test.v_ayer')::uuid, 'error de carga')$q$));
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',false) \gset
select public.cancel_sale(:'v_ayer', 'error de carga');
select pg_temp.esperar('El dueño anula la venta de un día cobrado; el cobro no se toca',
  (select status = 'PAID' and paid_total = 4000 from public.payout_days where day = private.ar_today() - 1));
select pg_temp.esperar('Se entregó de más: ajuste -4000',
  (select ajuste = -4000 from public.ajuste_cobros(:'biz') where barber_membership_id = :'m1'));

-- Cobrar anteayer (3000) con ese ajuste: se entrega 0 y quedan -1000 por descontar
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',false) \gset
select public.request_payout(:'biz', array[private.ar_today() - 2]);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Con -4000 de ajuste, el cobro de 3000 entrega 0 (nunca negativo)',
  public.decide_payout(:'biz', :'m1', array[private.ar_today() - 2], true) = 0);
select pg_temp.esperar('Quedan -1000 para descontar',
  (select ajuste = -1000 from public.ajuste_cobros(:'biz') where barber_membership_id = :'m1'));

-- Venta cargada tarde en un día cobrado (ayer, 2000 -> 1000 de comisión): el ajuste se compensa
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000003',false) \gset
select public.register_sale(:'biz', :'m1', 2000, 'EFECTIVO', gen_random_uuid(), null, now() - interval '1 day') \gset
select pg_temp.esperar('Con la venta tardía el ajuste vuelve a 0',
  (select ajuste = 0 from public.ajuste_cobros(:'biz') where barber_membership_id = :'m1'));
select pg_temp.esperar('Un barbero solo ve su propio ajuste (1 fila)',
  (select count(*) from public.ajuste_cobros(:'biz')) = 1);

-- ===== El dueño marca cobrado un día que no se pidió =====
select public.register_sale(:'biz', :'m1', 4000, 'EFECTIVO', gen_random_uuid(), null, now() - interval '3 days') \gset
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('El dueño cobra directo un día no pedido (2000)',
  public.decide_payout(:'biz', :'m1', array[private.ar_today() - 3], true) = 2000);
select pg_temp.esperar('Rechazar un día sin pedido falla',
  pg_temp.falla($q$select public.decide_payout(current_setting('test.biz_x')::uuid, (select id from public.memberships where display_name='Barbero 1'), array[private.ar_today() - 4], false, 'no corresponde')$q$));
select pg_temp.esperar('La auditoría registra los cobros',
  (select count(*) from public.audit_log where entity = 'payout_days') >= 5);
