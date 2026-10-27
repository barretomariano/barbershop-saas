-- Pruebas de gastos. Requiere haber aplicado las migraciones 1, 2 y 3.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.esperar(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin if p_ok then raise notice 'OK     %', p_nombre; else raise exception 'FALLO  %', p_nombre; end if; end $$;
create or replace function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql into r; return r; end $$;
create or replace function pg_temp.falla(sql text) returns boolean language plpgsql as $$
begin execute sql; return false; exception when others then return true; end $$;
grant execute on all functions in schema pg_temp to public;

insert into auth.users (id) values
 ('c0000000-0000-0000-0000-000000000001'),('c0000000-0000-0000-0000-000000000002'),
 ('c0000000-0000-0000-0000-000000000003'),('d0000000-0000-0000-0000-000000000001');
select private.admin_create_business('Barbería C','c0000000-0000-0000-0000-000000000001','Owner C') as biz_c \gset
select private.admin_create_business('Barbería D','d0000000-0000-0000-0000-000000000001','Owner D') as biz_d \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_c','c0000000-0000-0000-0000-000000000002','MANAGER','Manager C'),
 (:'biz_c','c0000000-0000-0000-0000-000000000003','BARBER','Barbero C1');
select set_config('test.biz_c',:'biz_c',false), set_config('test.biz_d',:'biz_d',false) \gset

-- ===== Owner =====
set role authenticated; select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',false) \gset
select set_config('test.k1', gen_random_uuid()::text, false) \gset
select public.register_expense(current_setting('test.biz_c')::uuid, 'ALQUILER', 250000, current_setting('test.k1')::uuid, 'Alquiler de octubre');
select pg_temp.esperar('Owner registra un gasto', pg_temp.n('select count(*) from public.expenses') = 1);
select public.register_expense(current_setting('test.biz_c')::uuid, 'ALQUILER', 250000, current_setting('test.k1')::uuid, 'Alquiler de octubre');
select pg_temp.esperar('Repetir la misma clave no duplica el gasto', pg_temp.n('select count(*) from public.expenses') = 1);
select pg_temp.esperar('Monto cero se rechaza',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', 0, gen_random_uuid())$q$));
select pg_temp.esperar('Monto negativo se rechaza',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', -5, gen_random_uuid())$q$));
select pg_temp.esperar('Categoría inválida se rechaza',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'MAGIA', 100, gen_random_uuid())$q$));
select pg_temp.esperar('Fecha futura se rechaza',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', 100, gen_random_uuid(), null, now() + interval '2 days')$q$));
select pg_temp.esperar('Owner no puede registrar gastos en OTRO negocio',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_d')::uuid, 'INSUMOS', 100, gen_random_uuid())$q$));
select pg_temp.esperar('No se inserta directo en la tabla',
  pg_temp.falla($q$insert into public.expenses (business_id,category,amount,spent_at,created_by,idempotency_key) values (current_setting('test.biz_c')::uuid,'OTROS',1,now(),auth.uid(),gen_random_uuid())$q$));
select pg_temp.esperar('No se edita un gasto',
  pg_temp.falla($q$update public.expenses set amount = 1$q$));
select pg_temp.esperar('No se borra un gasto', pg_temp.falla($q$delete from public.expenses$q$));

-- ===== Manager =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000002',false) \gset
select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', 18000, gen_random_uuid(), 'Navajas');
select pg_temp.esperar('Manager registra y ve gastos', pg_temp.n('select count(*) from public.expenses') = 2);
select public.cancel_expense((select id from public.expenses where amount = 18000), 'Error de carga');
select pg_temp.esperar('Manager anula con motivo', pg_temp.n($q$select count(*) from public.expenses where status='CANCELED'$q$) = 1);
select pg_temp.esperar('No se anula dos veces',
  pg_temp.falla($q$select public.cancel_expense((select id from public.expenses where amount = 18000), 'otra vez')$q$));
select pg_temp.esperar('Anular sin motivo se rechaza',
  pg_temp.falla($q$select public.cancel_expense((select id from public.expenses where amount = 250000), 'x')$q$));
select pg_temp.esperar('Un gasto anulado no se reactiva',
  pg_temp.falla($q$update public.expenses set status='VALID' where amount = 18000$q$));

-- ===== Barbero: no ve ni carga gastos =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Barbero NO ve gastos', pg_temp.n('select count(*) from public.expenses') = 0);
select pg_temp.esperar('Barbero NO registra gastos',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', 100, gen_random_uuid())$q$));
select pg_temp.esperar('Barbero NO anula gastos',
  pg_temp.falla($q$select public.cancel_expense((select id from public.expenses limit 1), 'intento')$q$));

-- ===== Owner de otro negocio: aislamiento =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','d0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Owner de otro negocio NO ve gastos ajenos', pg_temp.n('select count(*) from public.expenses') = 0);

-- ===== Anónimo =====
reset role; set role anon;
select pg_temp.esperar('Anónimo NO registra gastos',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_c')::uuid, 'INSUMOS', 100, gen_random_uuid())$q$));
select pg_temp.esperar('Anónimo NO lee gastos', pg_temp.falla('select count(*) from public.expenses'));
reset role;
\echo TODAS LAS PRUEBAS DE GASTOS PASARON
