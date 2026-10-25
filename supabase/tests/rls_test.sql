-- Pruebas de aislamiento entre negocios y roles. Cada chequeo lanza error si falla.
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.esperar(p_nombre text, p_ok boolean) returns void language plpgsql as $$
begin
  if p_ok then raise notice 'OK     %', p_nombre; else raise exception 'FALLO  %', p_nombre; end if;
end $$;
grant execute on function pg_temp.esperar(text, boolean) to public;

-- Datos de prueba (como administrador)
insert into auth.users (id) values
 ('a0000000-0000-0000-0000-000000000001'), -- owner A
 ('a0000000-0000-0000-0000-000000000002'), -- manager A
 ('a0000000-0000-0000-0000-000000000003'), -- barbero A1
 ('a0000000-0000-0000-0000-000000000004'), -- barbero A2
 ('b0000000-0000-0000-0000-000000000001'), -- owner B
 ('c0000000-0000-0000-0000-000000000001'); -- usuario sin membresía

select private.admin_create_business('Barbería A', 'a0000000-0000-0000-0000-000000000001', 'Owner A') as biz_a \gset
select private.admin_create_business('Barbería B', 'b0000000-0000-0000-0000-000000000001', 'Owner B') as biz_b \gset
insert into public.memberships (business_id, user_id, role, display_name) values
 (:'biz_a','a0000000-0000-0000-0000-000000000002','MANAGER','Manager A'),
 (:'biz_a','a0000000-0000-0000-0000-000000000003','BARBER','Barbero A1'),
 (:'biz_a','a0000000-0000-0000-0000-000000000004','BARBER','Barbero A2');

select set_config('test.biz_a', :'biz_a', false);

-- Helper: actuar como un usuario del navegador
create or replace function pg_temp.n(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql into r; return r; end $$;
grant execute on function pg_temp.n(text) to public;


create or replace function pg_temp.afectadas(sql text) returns bigint language plpgsql as $$
declare r bigint; begin execute sql; get diagnostics r = row_count; return r; end $$;
grant execute on function pg_temp.afectadas(text) to public;

-- ===== Owner A =====
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001', false);
select pg_temp.esperar('Owner A ve solo su negocio', pg_temp.n('select count(*) from public.businesses') = 1);
select pg_temp.esperar('Owner A ve a los 4 miembros de su negocio', pg_temp.n('select count(*) from public.memberships') = 4);
select pg_temp.esperar('Owner A NO ve el negocio B', pg_temp.n($q$select count(*) from public.businesses where name='Barbería B'$q$) = 0);

-- ===== Manager A =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000002', false);
select pg_temp.esperar('Manager A ve el equipo (4)', pg_temp.n('select count(*) from public.memberships') = 4);
do $$ begin
  begin
    insert into public.memberships (business_id, user_id, role, display_name)
    values ((select id from public.businesses limit 1), 'c0000000-0000-0000-0000-000000000001', 'BARBER', 'Intruso');
    raise exception 'FALLO  Manager pudo agregar miembros';
  exception when insufficient_privilege then raise notice 'OK     Manager A NO puede agregar miembros';
  end;
end $$;
select pg_temp.esperar('Manager A no puede subirse a OWNER',
  pg_temp.afectadas($q$update public.memberships set role='OWNER' where user_id='a0000000-0000-0000-0000-000000000002'$q$) = 0);

-- ===== Barbero A1 =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003', false);
select pg_temp.esperar('Barbero A1 ve solo su propia membresía', pg_temp.n('select count(*) from public.memberships') = 1);
select pg_temp.esperar('Barbero A1 no puede ascenderse',
  pg_temp.afectadas($q$update public.memberships set role='OWNER' where user_id='a0000000-0000-0000-0000-000000000003'$q$) = 0);
select pg_temp.esperar('Barbero A1 no puede renombrar el negocio',
  pg_temp.afectadas($q$update public.businesses set name='Hackeado'$q$) = 0);

-- ===== Owner B (otro negocio) =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','b0000000-0000-0000-0000-000000000001', false);
select pg_temp.esperar('Owner B ve solo su negocio', pg_temp.n('select count(*) from public.businesses') = 1);
select pg_temp.esperar('Owner B no ve miembros de A', pg_temp.n($q$select count(*) from public.memberships where display_name like '%A%' and display_name <> 'Owner B'$q$) = 0);
do $$ begin
  begin
    insert into public.memberships (business_id, user_id, role, display_name)
    values (current_setting('test.biz_a')::uuid, 'c0000000-0000-0000-0000-000000000001', 'OWNER', 'Invasor');
    raise exception 'FALLO  Owner B pudo agregar miembros al negocio A';
  exception when insufficient_privilege then
    raise notice 'OK     Owner B NO puede agregar miembros al negocio A (bloqueado por RLS)';
  end;
end $$;

-- ===== Usuario sin membresía y anónimo =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001', false);
select pg_temp.esperar('Usuario sin membresía no ve negocios', pg_temp.n('select count(*) from public.businesses') = 0);
select pg_temp.esperar('Usuario sin membresía no ve miembros', pg_temp.n('select count(*) from public.memberships') = 0);
do $$ begin
  begin perform private.admin_create_business('Falso', 'c0000000-0000-0000-0000-000000000001', 'X');
    raise exception 'FALLO  usuario común pudo crear negocios';
  exception when insufficient_privilege then raise notice 'OK     Usuario común NO puede crear negocios';
  end;
end $$;
reset role; set role anon;
do $$ begin
  begin perform count(*) from public.businesses;
    raise exception 'FALLO  anónimo pudo leer negocios';
  exception when insufficient_privilege then raise notice 'OK     Anónimo NO puede leer negocios';
  end;
end $$;

-- ===== Regla del último OWNER (como administrador) =====
reset role;
do $$ begin
  begin
    update public.memberships set active=false where user_id='b0000000-0000-0000-0000-000000000001';
    raise exception 'FALLO  se desactivó al último OWNER';
  exception when others then
    if sqlerrm like 'FALLO%' then raise; end if;
    raise notice 'OK     No se puede desactivar al último OWNER';
  end;
end $$;
\echo TODAS LAS PRUEBAS PASARON
