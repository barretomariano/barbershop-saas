-- Pruebas de ventas y comisiones. Requiere haber aplicado las migraciones 1 y 2.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.esperar(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin if p_ok then raise notice 'OK     %', p_nombre; else raise exception 'FALLO  %', p_nombre; end if; end $$;
create or replace function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql into r; return r; end $$;
create or replace function pg_temp.afectadas(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql; get diagnostics r = row_count; return r; end $$;
-- true si la sentencia FALLA (lo que queremos en los intentos prohibidos)
create or replace function pg_temp.falla(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id) values
 ('a0000000-0000-0000-0000-000000000001'),('a0000000-0000-0000-0000-000000000002'),
 ('a0000000-0000-0000-0000-000000000003'),('a0000000-0000-0000-0000-000000000004'),
 ('b0000000-0000-0000-0000-000000000001'),('b0000000-0000-0000-0000-000000000002');

select private.admin_create_business('Barbería A','a0000000-0000-0000-0000-000000000001','Owner A') as biz_a \gset
select private.admin_create_business('Barbería B','b0000000-0000-0000-0000-000000000001','Owner B') as biz_b \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_a','a0000000-0000-0000-0000-000000000002','MANAGER','Manager A'),
 (:'biz_a','a0000000-0000-0000-0000-000000000003','BARBER','Barbero A1'),
 (:'biz_a','a0000000-0000-0000-0000-000000000004','BARBER','Barbero A2'),
 (:'biz_b','b0000000-0000-0000-0000-000000000002','BARBER','Barbero B1');
select id as m_a1 from public.memberships where user_id='a0000000-0000-0000-0000-000000000003' \gset
select id as m_a2 from public.memberships where user_id='a0000000-0000-0000-0000-000000000004' \gset
select id as m_b1 from public.memberships where user_id='b0000000-0000-0000-0000-000000000002' \gset
select set_config('test.biz_a',:'biz_a',false), set_config('test.biz_b',:'biz_b',false),
       set_config('test.m_a1',:'m_a1',false), set_config('test.m_a2',:'m_a2',false), set_config('test.m_b1',:'m_b1',false) \gset

-- ===== Barbero A1 intenta vender SIN comisión configurada =====
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Sin comisión configurada, la venta se rechaza',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 10001, 'EFECTIVO', gen_random_uuid())$q$));

-- ===== Manager no puede configurar comisiones; Owner sí =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Manager NO puede configurar comisiones',
  pg_temp.afectadas($q$update public.memberships set commission_model='PERCENT', commission_bps=9000, commission_configured=true where role='BARBER'$q$) = 0);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Owner configura A1 al 40%',
  pg_temp.afectadas($q$update public.memberships set commission_model='PERCENT', commission_bps=4000, commission_configured=true where id=current_setting('test.m_a1')::uuid$q$) = 1);
select pg_temp.esperar('Owner configura A2 con alquiler de silla',
  pg_temp.afectadas($q$update public.memberships set commission_model='CHAIR_RENT', commission_bps=0, commission_configured=true where id=current_setting('test.m_a2')::uuid$q$) = 1);

-- ===== Barbero A1 registra ventas =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select set_config('test.key1', gen_random_uuid()::text, false);
select public.register_sale(:'biz_a', :'m_a1', 10001, 'EFECTIVO', current_setting('test.key1')::uuid) as venta1 \gset
select pg_temp.esperar('Venta de $10001 al 40%: barbero 4000 y local 6001 (suma exacta)',
  pg_temp.n($q$select count(*) from public.sales where barber_amount=4000 and local_amount=6001 and amount=10001$q$) = 1);
select public.register_sale(:'biz_a', :'m_a1', 10001, 'EFECTIVO', current_setting('test.key1')::uuid) as venta1_repetida \gset
select pg_temp.esperar('Doble toque (misma clave) devuelve la misma venta', :'venta1' = :'venta1_repetida');
select pg_temp.esperar('Doble toque no duplica ventas', pg_temp.n('select count(*) from public.sales') = 1);
select pg_temp.esperar('Barbero A1 NO puede registrar ventas de A2',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a2')::uuid, 5000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Monto 0 rechazado',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 0, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Monto negativo rechazado',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, -500, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Fecha futura rechazada',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 500, 'EFECTIVO', gen_random_uuid(), null, now() + interval '2 days')$q$));
select pg_temp.esperar('Barbero NO puede insertar ventas directo (saltando la función)',
  pg_temp.falla($q$insert into public.sales (business_id,barber_membership_id,barber_user_id,amount,payment_method,sold_at,commission_model,commission_bps,barber_amount,local_amount,created_by,idempotency_key)
   values (current_setting('test.biz_a')::uuid,current_setting('test.m_a1')::uuid,'a0000000-0000-0000-0000-000000000003',1000,'EFECTIVO',now(),'PERCENT',9999,1000,0,'a0000000-0000-0000-0000-000000000003',gen_random_uuid())$q$));
select pg_temp.esperar('Barbero NO puede editar el monto de una venta',
  pg_temp.falla($q$update public.sales set amount=1, barber_amount=1, local_amount=0$q$));
select pg_temp.esperar('Barbero NO puede borrar ventas', pg_temp.falla('delete from public.sales'));
select pg_temp.esperar('Barbero NO puede anular ventas',
  pg_temp.falla($q$select public.cancel_sale((select id from public.sales limit 1), 'quiero anularla')$q$));

-- ===== Manager registra por A2 (alquiler de silla: 100% barbero) =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false) \gset
select public.register_sale(:'biz_a', :'m_a2', 8000, 'TRANSFERENCIA', gen_random_uuid()) as venta2 \gset
select pg_temp.esperar('Alquiler de silla: barbero se queda con 8000 y local 0',
  pg_temp.n($q$select count(*) from public.sales where amount=8000 and barber_amount=8000 and local_amount=0$q$) = 1);
select pg_temp.esperar('Manager ve las 2 ventas del negocio', pg_temp.n('select count(*) from public.sales') = 2);

-- ===== Cambiar la comisión NO altera ventas pasadas =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.afectadas($q$update public.memberships set commission_bps=6000 where id=current_setting('test.m_a1')::uuid$q$);
select pg_temp.esperar('Tras subir A1 al 60%, la venta anterior sigue en 4000',
  pg_temp.n($q$select count(*) from public.sales where id=current_setting('test.venta1_x', true)::uuid or (amount=10001 and barber_amount=4000 and commission_bps=4000)$q$) = 1);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select public.register_sale(:'biz_a', :'m_a1', 10000, 'DEBITO', gen_random_uuid());
select pg_temp.esperar('La venta nueva usa el 60% (6000)',
  pg_temp.n($q$select count(*) from public.sales where amount=10000 and barber_amount=6000 and commission_bps=6000$q$) = 1);
select pg_temp.esperar('Barbero A1 ve solo sus 2 ventas (no la de A2)', pg_temp.n('select count(*) from public.sales') = 2);

-- ===== Aislamiento entre negocios =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Owner B no ve ventas de A', pg_temp.n('select count(*) from public.sales') = 0);
select pg_temp.esperar('Owner B NO puede registrar ventas en el negocio A',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 5000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Owner B NO puede anular ventas de A',
  pg_temp.falla($q$select public.cancel_sale((select id from public.sales limit 1), 'intento ajeno')$q$));
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Barbero de B NO puede registrar ventas en A',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 5000, 'EFECTIVO', gen_random_uuid())$q$));

-- ===== Anulación =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Anular sin motivo se rechaza',
  pg_temp.falla($q$select public.cancel_sale((select id from public.sales where amount=8000), '')$q$));
select public.cancel_sale(:'venta2', 'Error de carga');
select pg_temp.esperar('Manager anula una venta con motivo',
  pg_temp.n($q$select count(*) from public.sales where amount=8000 and status='CANCELED'$q$) = 1);
select pg_temp.esperar('No se puede anular dos veces',
  pg_temp.falla($q$select public.cancel_sale((select id from public.sales where amount=8000), 'otra vez')$q$));
select pg_temp.esperar('Una venta anulada no se reactiva',
  pg_temp.falla($q$update public.sales set status='VALID' where amount=8000$q$));

-- ===== Anónimo =====
reset role; set role anon;
select pg_temp.esperar('Anónimo NO puede registrar ventas',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a1')::uuid, 5000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Anónimo NO puede leer ventas', pg_temp.falla('select count(*) from public.sales'));
reset role;
\echo TODAS LAS PRUEBAS DE VENTAS PASARON
