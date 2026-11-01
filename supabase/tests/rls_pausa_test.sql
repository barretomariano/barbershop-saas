-- Pruebas de pausa y administración (migración 15).
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
 ('c1000000-0000-0000-0000-000000000001','dueno@pausa.test'),('c1000000-0000-0000-0000-000000000002','barbero@pausa.test'),
 ('c1000000-0000-0000-0000-000000000003','otro@pausa.test'),('c1000000-0000-0000-0000-000000000009','sinbarberia@pausa.test');
select private.admin_alta('Barbería Pausa', 'DUENO@pausa.test', 'Dueño P') \gset
select private.admin_alta('Barbería Otra', 'otro@pausa.test', 'Otro') \gset
select id as biz from public.businesses where name='Barbería Pausa' \gset
select id as biz2 from public.businesses where name='Barbería Otra' \gset
insert into public.memberships (business_id,user_id,role,display_name) values (:'biz','c1000000-0000-0000-0000-000000000002','BARBER','Barbero P');
insert into public.memberships (business_id,user_id,role,display_name,active) values (:'biz','c1000000-0000-0000-0000-000000000009','BARBER','Ex empleado',false);
select set_config('test.biz',:'biz',false), set_config('test.biz2',:'biz2',false) \gset
select id as m_b from public.memberships where user_id='c1000000-0000-0000-0000-000000000002' \gset
select set_config('test.mb',:'m_b',false) \gset
update public.memberships set commission_model='PERCENT', commission_bps=4000, commission_configured=true where id=:'m_b';
select pg_temp.esperar('El alta por email funciona',
  pg_temp.n($q$select count(*) from public.memberships where business_id=current_setting('test.biz')::uuid and role='OWNER'$q$) = 1);
select pg_temp.esperar('No se da de alta dos veces al mismo usuario', pg_temp.falla($q$select private.admin_alta('Otra más','dueno@pausa.test','X')$q$));
select pg_temp.esperar('Un email que no existe da un error claro', pg_temp.falla($q$select private.admin_alta('Nueva','nadie@pausa.test','X')$q$));

-- Antes de pausar: el barbero registra una venta
set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('El barbero ve su negocio antes de la pausa', pg_temp.n($q$select count(*) from public.businesses$q$) = 1);
reset role;

-- Pausar
select private.admin_pausar('barbería pausa', 'No pagó noviembre') as r \gset
select pg_temp.esperar('Pausar apaga a los 2 activos (no al ex empleado)', pg_temp.n($q$select count(*) from public.memberships where business_id=current_setting('test.biz')::uuid and paused_off$q$) = 2);
select pg_temp.esperar('El negocio queda marcado como pausado', pg_temp.n($q$select count(*) from public.businesses where id=current_setting('test.biz')::uuid and paused_at is not null$q$) = 1);
select pg_temp.esperar('No se puede pausar dos veces', pg_temp.falla($q$select private.admin_pausar('Barbería Pausa')$q$));

set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Pausado: el barbero no ve el negocio', pg_temp.n($q$select count(*) from public.businesses$q$) = 0);
select pg_temp.esperar('Pausado: el barbero no puede registrar ventas',
  pg_temp.falla($q$select public.register_sale(current_setting('test.biz')::uuid, current_setting('test.mb')::uuid, 10000, 'EFECTIVO', gen_random_uuid())$q$));
select pg_temp.esperar('Pausado: sabe que es por la pausa', pg_temp.n($q$select count(*) from public.estado_de_mi_cuenta()$q$) = 1);
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000009',false) \gset
select pg_temp.esperar('Un ex empleado de antes no figura como pausado', pg_temp.n($q$select count(*) from public.estado_de_mi_cuenta()$q$) = 0);
select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Otra barbería sigue funcionando', pg_temp.n($q$select count(*) from public.businesses$q$) = 1);
select pg_temp.esperar('Un usuario normal no puede pausar ni reanudar',
  pg_temp.falla($q$select private.admin_pausar('Barbería Otra')$q$) and pg_temp.falla($q$select private.admin_reanudar('Barbería Pausa')$q$));
reset role;

-- Reanudar
select private.admin_reanudar('Barbería Pausa') as r \gset
select pg_temp.esperar('Reanudar devuelve a los 2 y no revive al ex empleado',
  pg_temp.n($q$select count(*) from public.memberships where business_id=current_setting('test.biz')::uuid and active$q$) = 2);
select pg_temp.esperar('Reanudar limpia la pausa', pg_temp.n($q$select count(*) from public.businesses where id=current_setting('test.biz')::uuid and paused_at is null and paused_note is null$q$) = 1);
set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Reanudado: el barbero vuelve a ver su negocio', pg_temp.n($q$select count(*) from public.businesses$q$) = 1);
select pg_temp.esperar('Reanudado: puede registrar ventas otra vez',
  pg_temp.n($q$select count(*) from (select public.register_sale(current_setting('test.biz')::uuid, current_setting('test.mb')::uuid, 10000, 'EFECTIVO', gen_random_uuid())) x$q$) = 1);
reset role;
select pg_temp.esperar('Los datos siguen ahí después de pausar y reanudar', pg_temp.n($q$select count(*) from public.sales where business_id=current_setting('test.biz')::uuid$q$) = 1);
select pg_temp.esperar('El tablero de control lista las barberías', pg_temp.n($q$select count(*) from private.admin_negocios()$q$) = 2);
select pg_temp.esperar('El ping responde sin sesión', pg_temp.n($q$select count(*) from (select public.ping()) x$q$) = 1);
\echo TODO OK
