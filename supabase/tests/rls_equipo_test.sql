-- Pruebas de la migración 5 (usuario de equipo). Requiere migraciones 1 a 5.
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
 ('a0000000-0000-0000-0000-000000000001'),('a0000000-0000-0000-0000-000000000003'),
 ('a0000000-0000-0000-0000-000000000004'),('b0000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000002');
select private.admin_create_business('Barbería A','a0000000-0000-0000-0000-000000000001','Owner A') as biz_a \gset
select private.admin_create_business('Barbería B','b0000000-0000-0000-0000-000000000001','Owner B') as biz_b \gset
select set_config('test.biz_a',:'biz_a',false), set_config('test.biz_b',:'biz_b',false) \gset

-- La función del servidor corre como administrador (no pasa por RLS): simulamos su inserción.
insert into public.memberships (business_id,user_id,role,display_name,username) values
 (:'biz_a','a0000000-0000-0000-0000-000000000003','BARBER','Juan','juan.perez'),
 (:'biz_a','a0000000-0000-0000-0000-000000000004','BARBER','Pedro',null);
select pg_temp.esperar('Se guarda un usuario válido', pg_temp.n($q$select count(*) from public.memberships where username='juan.perez'$q$) = 1);
select pg_temp.esperar('Un usuario con mayúsculas se rechaza',
  pg_temp.falla($q$update public.memberships set username='Juan.Perez' where display_name='Pedro'$q$));
select pg_temp.esperar('Un usuario muy corto se rechaza',
  pg_temp.falla($q$update public.memberships set username='ab' where display_name='Pedro'$q$));
select pg_temp.esperar('Un usuario con espacios o @ se rechaza',
  pg_temp.falla($q$update public.memberships set username='a b@c' where display_name='Pedro'$q$));
select pg_temp.esperar('No puede repetirse el usuario (ni en otro negocio)',
  pg_temp.falla(format($q$insert into public.memberships (business_id,user_id,role,display_name,username) values (%L,'b0000000-0000-0000-0000-000000000002','BARBER','Otro','juan.perez')$q$, :'biz_b')));
select pg_temp.esperar('Varias personas sin usuario conviven sin conflicto',
  not pg_temp.falla(format($q$insert into public.memberships (business_id,user_id,role,display_name) values (%L,'b0000000-0000-0000-0000-000000000002','BARBER','Sin usuario')$q$, :'biz_b')));

-- Desde el navegador (rol authenticated) NO se puede escribir el usuario
set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Dueño NO puede cambiar el usuario de alguien desde el navegador',
  pg_temp.falla($q$update public.memberships set username='nuevo.usuario' where display_name='Pedro'$q$));
select pg_temp.esperar('Dueño NO puede insertar miembros con usuario desde el navegador',
  pg_temp.falla(format($q$insert into public.memberships (business_id,user_id,role,display_name,username) values (%L,'a0000000-0000-0000-0000-000000000004','BARBER','X','x.usuario')$q$, :'biz_a')));
select pg_temp.esperar('Dueño ve el usuario de su equipo',
  pg_temp.n($q$select count(*) from public.memberships where username='juan.perez'$q$) = 1);
select pg_temp.esperar('Dueño de A NO ve los usuarios del equipo de B',
  pg_temp.n($q$select count(*) from public.memberships where display_name='Sin usuario'$q$) = 0);

reset role; set role authenticated; select set_config('request.jwt.claim.sub','a0000000-0000-0000-0000-000000000003',false) \gset
select pg_temp.esperar('Un barbero solo ve su propia fila (no el usuario de los demás)',
  pg_temp.n('select count(*) from public.memberships') = 1);
