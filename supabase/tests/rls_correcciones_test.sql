-- Pruebas de la migración 4 (Etapa B). Requiere haber aplicado las migraciones 1 a 4.
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
 ('b0000000-0000-0000-0000-000000000001'),('c0000000-0000-0000-0000-000000000001');

select private.admin_create_business('Barbería A','a0000000-0000-0000-0000-000000000001','Owner A') as biz_a \gset
select private.admin_create_business('Barbería B','b0000000-0000-0000-0000-000000000001','Owner B') as biz_b \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_a','a0000000-0000-0000-0000-000000000002','MANAGER','Manager A'),
 (:'biz_a','a0000000-0000-0000-0000-000000000003','BARBER','Barbero A1'),
 (:'biz_a','a0000000-0000-0000-0000-000000000004','BARBER','Barbero A2');
select id as m_owner from public.memberships where user_id='a0000000-0000-0000-0000-000000000001' \gset
select id as m_mgr from public.memberships where user_id='a0000000-0000-0000-0000-000000000002' \gset
select id as m_a1 from public.memberships where user_id='a0000000-0000-0000-0000-000000000003' \gset
select id as m_a2 from public.memberships where user_id='a0000000-0000-0000-0000-000000000004' \gset
select id as m_ownerb from public.memberships where user_id='b0000000-0000-0000-0000-000000000001' \gset
select set_config('test.biz_a',:'biz_a',false), set_config('test.biz_b',:'biz_b',false),
       set_config('test.m_owner',:'m_owner',false), set_config('test.m_mgr',:'m_mgr',false),
       set_config('test.m_a1',:'m_a1',false), set_config('test.m_a2',:'m_a2',false),
       set_config('test.m_ownerb',:'m_ownerb',false) \gset

-- ===== Owner configura solo a A1 (40%); A2, el encargado y el dueño quedan sin configurar =====
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Owner configura A1 al 40%',
  pg_temp.afectadas($q$update public.memberships set commission_model='PERCENT', commission_bps=4000, commission_configured=true where id=current_setting('test.m_a1')::uuid$q$) = 1);

-- ===== 1. El dueño puede vender =====
select public.register_sale(:'biz_a', :'m_owner', 8000, 'EFECTIVO', gen_random_uuid()) as v_owner \gset
select pg_temp.esperar('Dueño vende sin comisión configurada: barbero 0 y local 8000',
  pg_temp.n($q$select count(*) from public.sales where amount=8000 and barber_amount=0 and local_amount=8000 and barber_membership_id=current_setting('test.m_owner')::uuid$q$) = 1);
select public.register_sale(:'biz_a', :'m_mgr', 5000, 'DEBITO', gen_random_uuid()) as v_mgr \gset
select pg_temp.esperar('Encargado puede figurar como quien atendió (local 5000)',
  pg_temp.n($q$select count(*) from public.sales where amount=5000 and local_amount=5000 and barber_membership_id=current_setting('test.m_mgr')::uuid$q$) = 1);
select public.register_sale(:'biz_a', :'m_a1', 10000, 'EFECTIVO', gen_random_uuid()) as v_a1 \gset
select pg_temp.esperar('Dueño registra una venta de A1 al 40%: 4000 / 6000',
  pg_temp.n($q$select count(*) from public.sales where amount=10000 and barber_amount=4000 and local_amount=6000$q$) = 1);
select pg_temp.esperar('Barbero A2 sin comisión configurada sigue rechazado',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_a2')::uuid, 3000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Dueño de A NO puede registrar a alguien de otro negocio',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_ownerb')::uuid, 3000, 'EFECTIVO', gen_random_uuid())$q$));

-- El dueño se configura un 10%: la venta guarda esa comisión
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Dueño puede configurarse una comisión del 10%',
  pg_temp.afectadas($q$update public.memberships set commission_model='PERCENT', commission_bps=1000, commission_configured=true where id=current_setting('test.m_owner')::uuid$q$) = 1);
select public.register_sale(:'biz_a', :'m_owner', 2000, 'EFECTIVO', gen_random_uuid()) as v_owner2 \gset
select pg_temp.esperar('Con comisión configurada se aplica: 200 / 1800',
  pg_temp.n($q$select count(*) from public.sales where amount=2000 and barber_amount=200 and local_amount=1800$q$) = 1);

-- ===== Un barbero solo registra lo suyo =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Barbero A1 NO puede registrar una venta a nombre del dueño',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_owner')::uuid, 3000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Barbero A1 NO puede registrar a nombre del encargado',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_mgr')::uuid, 3000, 'EFECTIVO', gen_random_uuid())$q$));
select public.register_sale(:'biz_a', :'m_a1', 1000, 'EFECTIVO', gen_random_uuid()) as v_a1b \gset
select pg_temp.esperar('Barbero A1 registra la suya y ve sus 2 ventas (la del dueño a su nombre y la propia)', pg_temp.n('select count(*) from public.sales') = 2);

-- ===== 3. Límite de antigüedad (90 días) =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Venta de hace 120 días rechazada',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_owner')::uuid, 500, 'EFECTIVO', gen_random_uuid(), null, now() - interval '120 days')$q$));
select pg_temp.esperar('Venta de hace 30 días aceptada',
  not pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_owner')::uuid, 500, 'EFECTIVO', gen_random_uuid(), null, now() - interval '30 days')$q$));
select pg_temp.esperar('Gasto de hace 120 días rechazado',
  pg_temp.falla($q$select public.register_expense(current_setting('test.biz_a')::uuid, 'INSUMOS', 500, gen_random_uuid(), null, now() - interval '120 days')$q$));
select pg_temp.esperar('Gasto de hace 30 días aceptado',
  not pg_temp.falla($q$select public.register_expense(current_setting('test.biz_a')::uuid, 'INSUMOS', 500, gen_random_uuid(), null, now() - interval '30 days')$q$));

-- ===== 2. Servicios: el nombre se libera al quitar el servicio =====
insert into public.services (business_id, name, default_price) values (:'biz_a', 'Corte', 8000);
select pg_temp.esperar('No se puede crear otro servicio activo con el mismo nombre',
  pg_temp.falla($q$insert into public.services (business_id, name, default_price) values (current_setting('test.biz_a')::uuid, 'Corte', 9000)$q$));
select pg_temp.esperar('Se quita el servicio (active=false)',
  pg_temp.afectadas($q$update public.services set active=false where name='Corte'$q$) = 1);
select pg_temp.esperar('Ahora se puede crear "Corte" de nuevo',
  not pg_temp.falla($q$insert into public.services (business_id, name, default_price) values (current_setting('test.biz_a')::uuid, 'Corte', 9500)$q$));
select pg_temp.esperar('Reactivar el viejo mientras existe uno activo igual se rechaza',
  pg_temp.falla($q$update public.services set active=true where default_price=8000$q$));
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Otro negocio (B) puede tener un servicio "Corte" activo también',
  not pg_temp.falla($q$insert into public.services (business_id, name, default_price) values (current_setting('test.biz_b')::uuid, 'Corte', 7000)$q$));
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset

-- ===== 4. Resúmenes calculados en la base =====
-- Anulamos la venta del encargado para comprobar que no suma
select public.cancel_sale(:'v_mgr', 'error de carga');
select pg_temp.esperar('Resumen de ventas (dueño): vendido = 8000+10000+2000+1000+500 = 21500',
  (select coalesce(sum(vendido),0) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 21500);
select pg_temp.esperar('Resumen: la venta anulada del encargado NO suma',
  (select coalesce(sum(vendido),0) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour') where barber_membership_id = :'m_mgr') = 0);
select pg_temp.esperar('Resumen: para barbero + para local = vendido',
  (select sum(para_barbero + para_local) - sum(vendido) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 0);
select pg_temp.esperar('Resumen de gastos (dueño): 500 (el de hace 30 días)',
  (select coalesce(sum(total),0) from public.resumen_gastos(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 500);

-- Sin límite de 500: 600 ventas se suman completas
select public.register_sale(:'biz_a', :'m_owner', 100, 'EFECTIVO', gen_random_uuid()) from generate_series(1, 600);
select pg_temp.esperar('600 ventas más: el resumen suma todas (60000 más)',
  (select sum(vendido) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 81500);
select pg_temp.esperar('Y la cantidad cuenta las 600',
  (select sum(cantidad) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour') where barber_membership_id = :'m_owner') >= 600);

-- Un barbero solo ve lo suyo en el resumen y nada de gastos
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Barbero A1: su resumen incluye solo sus ventas (11000 = 10000 + 1000)',
  (select sum(vendido) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 11000);
select pg_temp.esperar('Barbero A1: el resumen de gastos viene vacío',
  (select count(*) from public.resumen_gastos(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 0);

-- Aislamiento entre negocios
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Dueño de B pidiendo el resumen de A: vacío',
  (select count(*) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 0);
select pg_temp.esperar('Dueño de B pidiendo los gastos de A: vacío',
  (select count(*) from public.resumen_gastos(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 0);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Usuario sin negocio: resumen de ventas vacío',
  (select count(*) from public.resumen_ventas(:'biz_a', now() - interval '60 days', now() + interval '1 hour')) = 0);

-- Sin sesión no se puede ejecutar
reset role; set role anon;
select pg_temp.esperar('Sin sesión (anon) NO puede pedir el resumen de ventas',
  pg_temp.falla($q$select * from public.resumen_ventas(current_setting('test.biz_a')::uuid, now() - interval '1 day', now())$q$));
select pg_temp.esperar('Sin sesión (anon) NO puede pedir el resumen de gastos',
  pg_temp.falla($q$select * from public.resumen_gastos(current_setting('test.biz_a')::uuid, now() - interval '1 day', now())$q$));
select pg_temp.esperar('Sin sesión (anon) NO puede registrar ventas',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz_a')::uuid, current_setting('test.m_owner')::uuid, 100, 'EFECTIVO', gen_random_uuid())$q$));
