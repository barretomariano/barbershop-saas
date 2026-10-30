-- Pruebas de marca propia (migración 11).
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
select public.set_branding(current_setting('test.g')::uuid, 'Barbería El Corte', 'El-Corte');
select pg_temp.esperar('El dueño guarda nombre y slug (en minúsculas)',
  pg_temp.n($q$select count(*) from public.businesses where name='Barbería El Corte' and slug='el-corte'$q$) = 1);
select pg_temp.esperar('Slug con espacios o acentos se rechaza',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'X Barbería', 'el corte')$q$));
select pg_temp.esperar('Slug reservado se rechaza',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'X Barbería', 'admin')$q$));
select pg_temp.esperar('Nombre muy corto se rechaza',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'X', 'el-corte')$q$));
select pg_temp.esperar('El logo sube de versión y se puede quitar',
  public.set_logo(current_setting('test.g')::uuid, true) = 1 and public.set_logo(current_setting('test.g')::uuid, true) = 2 and public.set_logo(current_setting('test.g')::uuid, false) = 0);
select public.set_logo(current_setting('test.g')::uuid, true);

-- Un barbero no puede cambiar la marca
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Un barbero no cambia la marca',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'Hackeado', 'hack-1')$q$));
select pg_temp.esperar('Un barbero no cambia el logo',
  pg_temp.falla($q$select public.set_logo(current_setting('test.g')::uuid, false)$q$));

-- Otro negocio no puede usar el mismo slug ni cambiar este
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Otro negocio no puede quedarse con un slug ocupado',
  pg_temp.falla($q$select public.set_branding(current_setting('test.h')::uuid, 'Otra Barbería', 'el-corte')$q$));
select pg_temp.esperar('Otro negocio no puede cambiar la marca ajena',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'Robada', 'robada')$q$));

-- Lectura pública sin sesión
reset role; set role anon; select set_config('request.jwt.claim.sub','',false) \gset
select pg_temp.esperar('Sin sesión se lee solo la marca pública',
  pg_temp.n($q$select count(*) from public.branding_publico('EL-CORTE') where name='Barbería El Corte' and logo_version=1$q$) = 1);
select pg_temp.esperar('Slug inexistente devuelve vacío',
  pg_temp.n($q$select count(*) from public.branding_publico('no-existe')$q$) = 0);
select pg_temp.esperar('Sin sesión no se puede cambiar la marca',
  pg_temp.falla($q$select public.set_branding(current_setting('test.g')::uuid, 'Anon', 'anon-1')$q$));
\echo TODO OK
