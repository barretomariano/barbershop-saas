-- Pruebas de módulos y widgets. Requiere haber aplicado las migraciones 1 y 6.
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
 ('e0000000-0000-0000-0000-000000000001'),('e0000000-0000-0000-0000-000000000002'),
 ('e0000000-0000-0000-0000-000000000003'),('f0000000-0000-0000-0000-000000000001');
select private.admin_create_business('Barbería E','e0000000-0000-0000-0000-000000000001','Owner E') as biz_e \gset
select private.admin_create_business('Barbería F','f0000000-0000-0000-0000-000000000001','Owner F') as biz_f \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_e','e0000000-0000-0000-0000-000000000002','MANAGER','Manager E'),
 (:'biz_e','e0000000-0000-0000-0000-000000000003','BARBER','Barbero E1');
select set_config('test.biz_e',:'biz_e',false), set_config('test.biz_f',:'biz_f',false) \gset

select pg_temp.esperar('Un negocio nuevo arranca en plan BASICO y sin puesta en marcha',
  pg_temp.n($q$select count(*) from public.businesses where plan='BASICO' and setup_completed_at is null$q$) = 2);

-- ===== Owner =====
set role authenticated; select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Antes de configurar no hay módulos activos',
  pg_temp.n('select count(*) from public.business_modules where enabled') = 0);
select public.save_modules(current_setting('test.biz_e')::uuid, array['AGENDA']::public.business_module[], true);
select pg_temp.esperar('Owner enciende AGENDA',
  pg_temp.n($q$select count(*) from public.business_modules where module='AGENDA' and enabled$q$) = 1);
select pg_temp.esperar('CLIENTES queda apagado',
  pg_temp.n($q$select count(*) from public.business_modules where module='CLIENTES' and not enabled$q$) = 1);
select pg_temp.esperar('Se marca la puesta en marcha como terminada',
  pg_temp.n('select count(*) from public.businesses where setup_completed_at is not null') = 1);
select set_config('test.setup1', (select setup_completed_at::text from public.businesses where id = current_setting('test.biz_e')::uuid), false) \gset
select public.save_modules(current_setting('test.biz_e')::uuid, array['AGENDA','CLIENTES']::public.business_module[], true);
select pg_temp.esperar('Owner enciende también CLIENTES', pg_temp.n('select count(*) from public.business_modules where enabled') = 2);
select pg_temp.esperar('La fecha de puesta en marcha no se pisa',
  (select setup_completed_at::text from public.businesses where id = current_setting('test.biz_e')::uuid) = current_setting('test.setup1'));
select public.save_modules(current_setting('test.biz_e')::uuid, array[]::public.business_module[]);
select pg_temp.esperar('Owner apaga todo', pg_temp.n('select count(*) from public.business_modules where enabled') = 0);
select public.save_modules(current_setting('test.biz_e')::uuid, null);
select pg_temp.esperar('Lista nula equivale a todo apagado', pg_temp.n('select count(*) from public.business_modules where enabled') = 0);
select pg_temp.esperar('Owner no cambia módulos de OTRO negocio',
  pg_temp.falla($q$select public.save_modules(current_setting('test.biz_f')::uuid, array['AGENDA']::public.business_module[])$q$));
select pg_temp.esperar('No se escribe directo en business_modules',
  pg_temp.falla($q$update public.business_modules set enabled = true$q$));
select pg_temp.esperar('No se inserta directo en business_modules',
  pg_temp.falla($q$insert into public.business_modules (business_id,module,enabled) values (current_setting('test.biz_e')::uuid,'AGENDA',true)$q$));
select pg_temp.esperar('No se cambia el plan desde el navegador',
  pg_temp.falla($q$update public.businesses set plan='AVANZADO'$q$));
select pg_temp.esperar('No se toca setup_completed_at desde el navegador',
  pg_temp.falla($q$update public.businesses set setup_completed_at = null$q$));
select public.save_modules(current_setting('test.biz_e')::uuid, array['AGENDA']::public.business_module[]);
select pg_temp.esperar('module_enabled responde true para AGENDA',
  private.module_enabled(current_setting('test.biz_e')::uuid, 'AGENDA'));
select pg_temp.esperar('module_enabled responde false para CLIENTES',
  not private.module_enabled(current_setting('test.biz_e')::uuid, 'CLIENTES'));

-- Widgets propios
insert into public.user_widgets (business_id, user_id, layout)
  values (current_setting('test.biz_e')::uuid, auth.uid(), '[{"id":"ventas_hoy","size":"M"}]');
select pg_temp.esperar('Owner guarda su disposición de widgets', pg_temp.n('select count(*) from public.user_widgets') = 1);
update public.user_widgets set layout = '[{"id":"ventas_hoy","size":"L"},{"id":"metas","size":"S"}]';
select pg_temp.esperar('Owner actualiza su disposición',
  pg_temp.n($q$select jsonb_array_length(layout) from public.user_widgets$q$) = 2);
select pg_temp.esperar('Layout que no es lista se rechaza',
  pg_temp.falla($q$update public.user_widgets set layout = '{"a":1}'$q$));
select pg_temp.esperar('Layout con más de 30 widgets se rechaza',
  pg_temp.falla($q$update public.user_widgets set layout = (select jsonb_agg(jsonb_build_object('id', g)) from generate_series(1,31) g)$q$));
select pg_temp.esperar('Layout enorme se rechaza',
  pg_temp.falla($q$update public.user_widgets set layout = jsonb_build_array(repeat('x', 9000))$q$));
select pg_temp.esperar('No se guarda widgets en nombre de otra persona',
  pg_temp.falla($q$insert into public.user_widgets (business_id,user_id,layout) values (current_setting('test.biz_e')::uuid,'e0000000-0000-0000-0000-000000000002','[]')$q$));
select pg_temp.esperar('No se guarda widgets en un negocio ajeno',
  pg_temp.falla($q$insert into public.user_widgets (business_id,user_id,layout) values (current_setting('test.biz_f')::uuid,auth.uid(),'[]')$q$));

-- ===== Manager: ve módulos, no los cambia =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Manager ve los módulos', pg_temp.n('select count(*) from public.business_modules') = 2);
select pg_temp.esperar('Manager NO cambia módulos',
  pg_temp.falla($q$select public.save_modules(current_setting('test.biz_e')::uuid, array['CLIENTES']::public.business_module[])$q$));
select pg_temp.esperar('Manager NO ve los widgets de otra persona', pg_temp.n('select count(*) from public.user_widgets') = 0);

-- ===== Barbero =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','e0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Barbero ve qué módulos hay activos', pg_temp.n('select count(*) from public.business_modules where enabled') = 1);
select pg_temp.esperar('Barbero NO cambia módulos',
  pg_temp.falla($q$select public.save_modules(current_setting('test.biz_e')::uuid, array['CLIENTES']::public.business_module[])$q$));
insert into public.user_widgets (business_id, user_id, layout) values (current_setting('test.biz_e')::uuid, auth.uid(), '[]');
select pg_temp.esperar('Barbero guarda sus propios widgets', pg_temp.n('select count(*) from public.user_widgets') = 1);

-- ===== Owner de otro negocio: aislamiento =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','f0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Owner de otro negocio NO ve módulos ajenos', pg_temp.n('select count(*) from public.business_modules') = 0);
select pg_temp.esperar('Owner de otro negocio NO ve widgets ajenos', pg_temp.n('select count(*) from public.user_widgets') = 0);

-- ===== Anónimo =====
reset role; set role anon;
select pg_temp.esperar('Anónimo NO cambia módulos',
  pg_temp.falla($q$select public.save_modules(current_setting('test.biz_e')::uuid, array['AGENDA']::public.business_module[])$q$));
select pg_temp.esperar('Anónimo NO lee módulos', pg_temp.falla('select count(*) from public.business_modules'));
select pg_temp.esperar('Anónimo NO lee widgets', pg_temp.falla('select count(*) from public.user_widgets'));
reset role;
\echo TODAS LAS PRUEBAS DE MODULOS Y WIDGETS PASARON
