-- Pruebas de proveedores, gastos recurrentes, cierre de caja, liquidación, presupuestos, auditoría y reportes.
-- Requiere las migraciones 1 a 8 (Postgres local con 00_simular_supabase.sql).
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
 ('c1000000-0000-0000-0000-000000000001'),('c1000000-0000-0000-0000-000000000002'),
 ('c1000000-0000-0000-0000-000000000003'),('c1000000-0000-0000-0000-000000000004'),
 ('d1000000-0000-0000-0000-000000000001');
select private.admin_create_business('Barbería J','c1000000-0000-0000-0000-000000000001','Owner J') as biz_j \gset
select private.admin_create_business('Barbería K','d1000000-0000-0000-0000-000000000001','Owner K') as biz_k \gset
insert into public.memberships (business_id,user_id,role,display_name) values
 (:'biz_j','c1000000-0000-0000-0000-000000000002','MANAGER','Manager J'),
 (:'biz_j','c1000000-0000-0000-0000-000000000003','BARBER','Barbero J1'),
 (:'biz_j','c1000000-0000-0000-0000-000000000004','BARBER','Barbero J2');
select id as m_b1 from public.memberships where user_id='c1000000-0000-0000-0000-000000000003' \gset
select id as m_b2 from public.memberships where user_id='c1000000-0000-0000-0000-000000000004' \gset
select id as m_own from public.memberships where user_id='c1000000-0000-0000-0000-000000000001' \gset
select set_config('test.j',:'biz_j',false), set_config('test.k',:'biz_k',false),
       set_config('test.b1',:'m_b1',false), set_config('test.b2',:'m_b2',false), set_config('test.own',:'m_own',false) \gset
-- Barbero 1: 50% de comisión. Barbero 2: alquiler de silla.
update public.memberships set commission_model='PERCENT', commission_bps=5000, commission_configured=true where id=:'m_b1';
update public.memberships set commission_model='CHAIR_RENT', commission_bps=0, commission_configured=true where id=:'m_b2';

-- ===== Dueño =====
set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',false) \gset
select public.save_modules(current_setting('test.j')::uuid, array['CLIENTES']::public.business_module[], true);

-- Proveedores
insert into public.suppliers (business_id,name,phone) values (current_setting('test.j')::uuid,'Distribuidora Sur','11 4444-5555');
select id as prov from public.suppliers \gset
select set_config('test.prov',:'prov',false) \gset
select pg_temp.esperar('Dueño crea un proveedor', pg_temp.n('select count(*) from public.suppliers') = 1);
select pg_temp.esperar('Nombre de proveedor repetido (activo) se rechaza',
  pg_temp.falla($q$insert into public.suppliers (business_id,name) values (current_setting('test.j')::uuid,'Distribuidora Sur')$q$));
select pg_temp.esperar('Teléfono de proveedor inválido se rechaza',
  pg_temp.falla($q$insert into public.suppliers (business_id,name,phone) values (current_setting('test.j')::uuid,'Otro','hola')$q$));
select pg_temp.esperar('No se crea un proveedor en otro negocio',
  pg_temp.falla($q$insert into public.suppliers (business_id,name) values (current_setting('test.k')::uuid,'Intruso')$q$));
select public.register_expense(current_setting('test.j')::uuid, 'INSUMOS', 12000, gen_random_uuid(), 'Shampoo', now(), current_setting('test.prov')::uuid);
select pg_temp.esperar('Gasto con proveedor se registra',
  pg_temp.n($q$select count(*) from public.expenses where supplier_id = current_setting('test.prov')::uuid$q$) = 1);
select pg_temp.esperar('Gasto con proveedor de otro negocio se rechaza',
  pg_temp.falla($q$select public.register_expense(current_setting('test.k')::uuid, 'INSUMOS', 1000, gen_random_uuid(), null, now(), current_setting('test.prov')::uuid)$q$));
select pg_temp.esperar('Gasto sin proveedor sigue funcionando (firma anterior)',
  public.register_expense(current_setting('test.j')::uuid, 'OTROS', 500, gen_random_uuid()) is not null);

-- Gastos recurrentes
insert into public.recurring_expenses (business_id,category,description,amount,day_of_month)
  values (current_setting('test.j')::uuid,'ALQUILER','Alquiler del local',250000,1);
insert into public.recurring_expenses (business_id,category,description,amount,day_of_month,supplier_id)
  values (current_setting('test.j')::uuid,'SERVICIOS','Internet',30000,1,current_setting('test.prov')::uuid);
select pg_temp.esperar('Día del mes mayor a 28 se rechaza',
  pg_temp.falla($q$insert into public.recurring_expenses (business_id,category,amount,day_of_month) values (current_setting('test.j')::uuid,'OTROS',100,29)$q$));
select pg_temp.esperar('Monto recurrente inválido se rechaza',
  pg_temp.falla($q$insert into public.recurring_expenses (business_id,category,amount,day_of_month) values (current_setting('test.j')::uuid,'OTROS',0,5)$q$));
select pg_temp.esperar('Se generan los recurrentes del mes', public.generate_recurring_expenses(current_setting('test.j')::uuid) = 2);
select pg_temp.esperar('Volver a generar no duplica', public.generate_recurring_expenses(current_setting('test.j')::uuid) = 0);
select pg_temp.esperar('Los gastos recurrentes quedan cargados',
  pg_temp.n($q$select count(*) from public.expenses where description in ('Alquiler del local','Internet')$q$) = 2);
update public.recurring_expenses set active = false where description = 'Alquiler del local';
select pg_temp.esperar('Un recurrente inactivo no genera nada y no rompe',
  public.generate_recurring_expenses(current_setting('test.j')::uuid) = 0);
select pg_temp.esperar('No se edita la fecha de última generación directamente',
  pg_temp.falla($q$update public.recurring_expenses set last_generated_month = null$q$));

-- Metas y presupuestos (para auditoría)
select public.set_budget(current_setting('test.j')::uuid, 'INSUMOS', now()::date, 50000);
select pg_temp.esperar('Dueño define un presupuesto', pg_temp.n('select count(*) from public.budgets') = 1);
select public.set_budget(current_setting('test.j')::uuid, 'INSUMOS', date_trunc('month', now())::date + 1, 60000);
select pg_temp.esperar('Repetir mes y categoría reemplaza el presupuesto',
  pg_temp.n('select count(*) from public.budgets') = 1 and pg_temp.n('select amount from public.budgets') = 60000);
select pg_temp.esperar('Categoría inválida de presupuesto se rechaza',
  pg_temp.falla($q$select public.set_budget(current_setting('test.j')::uuid, 'XYZ', now()::date, 1)$q$));
select pg_temp.esperar('Presupuesto negativo se rechaza',
  pg_temp.falla($q$select public.set_budget(current_setting('test.j')::uuid, 'INSUMOS', now()::date, -1)$q$));
select pg_temp.esperar('No se escribe directo en presupuestos',
  pg_temp.falla($q$update public.budgets set amount = 1$q$));
select public.set_budget(current_setting('test.j')::uuid, 'ALQUILER', now()::date, 10);
select public.set_budget(current_setting('test.j')::uuid, 'ALQUILER', now()::date, 0);
select pg_temp.esperar('Presupuesto 0 lo borra', pg_temp.n($q$select count(*) from public.budgets where category='ALQUILER'$q$) = 0);

-- ===== Ventas del día (barbero 1 y 2) =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000003',false) \gset
insert into public.clients (business_id,name,phone) values (current_setting('test.j')::uuid,'Cliente Fiel','1133334444');
select id as cli from public.clients \gset
select set_config('test.cli',:'cli',false) \gset
select public.register_sale(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, 10000, 'EFECTIVO', gen_random_uuid(), null, now(), null, current_setting('test.cli')::uuid);
select public.register_sale(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, 5000, 'TRANSFERENCIA', gen_random_uuid(), null, now(), null, current_setting('test.cli')::uuid);
select public.register_sale(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, 3000, 'EFECTIVO', gen_random_uuid());
select id as venta_anulable from public.sales where amount = 3000 \gset
select set_config('test.vanul',:'venta_anulable',false) \gset
select pg_temp.esperar('Barbero NO ve proveedores', pg_temp.n('select count(*) from public.suppliers') = 0);
select pg_temp.esperar('Barbero NO ve gastos recurrentes', pg_temp.n('select count(*) from public.recurring_expenses') = 0);
select pg_temp.esperar('Barbero NO genera gastos recurrentes',
  pg_temp.falla($q$select public.generate_recurring_expenses(current_setting('test.j')::uuid)$q$));
select pg_temp.esperar('Barbero NO cierra la caja',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 0)$q$));
select pg_temp.esperar('Barbero NO ve presupuestos', pg_temp.n('select count(*) from public.budgets') = 0);
select pg_temp.esperar('Barbero NO ve la auditoría', pg_temp.n('select count(*) from public.audit_log') = 0);
select pg_temp.esperar('Barbero NO escribe en la auditoría',
  pg_temp.falla($q$insert into public.audit_log (business_id,action,entity) values (current_setting('test.j')::uuid,'X','y')$q$));
select pg_temp.esperar('Barbero ve su pendiente de liquidación (solo lo suyo)',
  pg_temp.n($q$select a_pagar from public.pendiente_liquidacion(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$) = 9000);
select pg_temp.esperar('Barbero NO liquida comisiones',
  pg_temp.falla($q$select public.settle_commissions(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$));

reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000004',false) \gset
select public.register_sale(current_setting('test.j')::uuid, current_setting('test.b2')::uuid, 20000, 'EFECTIVO', gen_random_uuid());

-- ===== Encargado: caja =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select public.cancel_sale(current_setting('test.vanul')::uuid, 'cargada por error');
select pg_temp.esperar('Encargado ve proveedores y recurrentes', pg_temp.n('select count(*) from public.suppliers') + pg_temp.n('select count(*) from public.recurring_expenses') = 3);
select pg_temp.esperar('Encargado ve presupuestos', pg_temp.n('select count(*) from public.budgets') = 1);
select pg_temp.esperar('Encargado NO define presupuestos',
  pg_temp.falla($q$select public.set_budget(current_setting('test.j')::uuid, 'OTROS', now()::date, 1000)$q$));
select pg_temp.esperar('Encargado NO ve la auditoría', pg_temp.n('select count(*) from public.audit_log') = 0);
select pg_temp.esperar('Cierre de caja de un día futuro se rechaza',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1, 0)$q$));
select pg_temp.esperar('Cierre de más de 30 días atrás se rechaza',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 40, 0)$q$));
select pg_temp.esperar('Efectivo contado negativo se rechaza',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, -1)$q$));
select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 29500, 'Faltó cambio');
select pg_temp.esperar('El efectivo esperado suma solo ventas válidas en efectivo (10000 + 20000)',
  pg_temp.n('select expected_cash from public.cash_closings') = 30000);
select pg_temp.esperar('La diferencia se guarda (29500 - 30000)', pg_temp.n('select difference from public.cash_closings') = -500);
select pg_temp.esperar('Se guarda el total vendido sin la venta anulada (10000+5000+20000)', pg_temp.n('select sales_total from public.cash_closings') = 35000);
select pg_temp.esperar('Se guardan los gastos del día', pg_temp.n('select expenses_total from public.cash_closings') >= 12500);
select pg_temp.esperar('Se guarda el detalle por medio de pago',
  pg_temp.n($q$select (by_method->>'TRANSFERENCIA')::bigint from public.cash_closings$q$) = 5000);
select pg_temp.esperar('Un día no se cierra dos veces',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 1)$q$));
select pg_temp.esperar('El cierre no se edita', pg_temp.falla($q$update public.cash_closings set counted_cash = 0$q$));
select pg_temp.esperar('El cierre no se borra', pg_temp.falla($q$delete from public.cash_closings$q$));
select pg_temp.esperar('Encargado cierra el día de ayer (sin ventas)',
  public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 1, 0) is not null);

-- ===== Encargado: liquidación =====
select pg_temp.esperar('Pendiente de liquidación: solo comisión por porcentaje (barbero 2 no aparece)',
  pg_temp.n($q$select count(*) from public.pendiente_liquidacion(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$) = 1);
select pg_temp.esperar('El pendiente del barbero 1 es la comisión de 10000 + 5000 (la anulada no cuenta)',
  pg_temp.n($q$select a_pagar from public.pendiente_liquidacion(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$) = 7500);
select pg_temp.esperar('Liquidar con fecha futura se rechaza',
  pg_temp.falla($q$select public.settle_commissions(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)$q$));
select pg_temp.esperar('Liquidar a una persona de otro negocio se rechaza',
  pg_temp.falla($q$select public.settle_commissions(current_setting('test.k')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$));
select public.settle_commissions(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date, 'Pago semanal');
select pg_temp.esperar('Se guarda la liquidación con el monto calculado por la base',
  pg_temp.n('select amount from public.settlements') = 7500 and pg_temp.n('select sales_count from public.settlements') = 2);
select pg_temp.esperar('Las ventas liquidadas quedan vinculadas', pg_temp.n('select count(*) from public.settlement_sales') = 2);
select pg_temp.esperar('Después de liquidar no queda pendiente',
  pg_temp.n($q$select count(*) from public.pendiente_liquidacion(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$) = 0);
select pg_temp.esperar('No se liquida dos veces lo mismo',
  pg_temp.falla($q$select public.settle_commissions(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date)$q$));
select pg_temp.esperar('No se anula una venta ya liquidada',
  pg_temp.falla($q$select public.cancel_sale((select id from public.sales where amount = 10000), 'quiero anularla')$q$));
select pg_temp.esperar('La liquidación no se edita', pg_temp.falla($q$update public.settlements set amount = 1$q$));
select pg_temp.esperar('La liquidación no se borra', pg_temp.falla($q$delete from public.settlements$q$));
select pg_temp.esperar('Las ventas liquidadas no se desvinculan', pg_temp.falla($q$delete from public.settlement_sales$q$));
select pg_temp.esperar('No se inserta una liquidación directo', pg_temp.falla($q$insert into public.settlements (business_id,barber_membership_id,upto,sales_count,sales_total,amount,created_by) values (current_setting('test.j')::uuid,current_setting('test.b1')::uuid,now()::date,1,1,1,auth.uid())$q$));

-- Una venta nueva se liquida sola en la siguiente liquidación
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000003',false) \gset
select public.register_sale(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, 4000, 'DEBITO', gen_random_uuid());
select pg_temp.esperar('Barbero ve su liquidación hecha', pg_temp.n('select count(*) from public.settlements') = 1);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select public.settle_commissions(current_setting('test.j')::uuid, current_setting('test.b1')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
select pg_temp.esperar('La segunda liquidación incluye solo la venta nueva (50% de 4000)',
  pg_temp.n('select amount from public.settlements order by created_at desc, amount limit 1') = 2000 and pg_temp.n('select count(*) from public.settlements') = 2);

-- Barbero 2 no ve liquidaciones ajenas
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000004',false) \gset
select pg_temp.esperar('Barbero 2 NO ve liquidaciones del barbero 1', pg_temp.n('select count(*) from public.settlements') = 0);

-- ===== Reportes =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000002',false) \gset
select pg_temp.esperar('Serie diaria suma las ventas válidas del día',
  pg_temp.n($q$select vendido from public.serie_diaria(current_setting('test.j')::uuid, now() - interval '2 days', now() + interval '1 hour')$q$) = 39000);
select pg_temp.esperar('Ventas por hora cuenta todas las ventas válidas',
  pg_temp.n($q$select sum(cantidad) from public.ventas_por_hora(current_setting('test.j')::uuid, now() - interval '2 days', now() + interval '1 hour')$q$) = 4);
select pg_temp.esperar('Top clientes: el cliente fiel gastó 15000 en 2 visitas',
  pg_temp.n($q$select gastado from public.top_clientes(current_setting('test.j')::uuid, now() - interval '2 days', now() + interval '1 hour')$q$) = 15000);
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000004',false) \gset
select pg_temp.esperar('Un barbero ve en los reportes solo lo suyo (20000)',
  pg_temp.n($q$select vendido from public.serie_diaria(current_setting('test.j')::uuid, now() - interval '2 days', now() + interval '1 hour')$q$) = 20000);

-- ===== Auditoría (solo dueño) =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','c1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Dueño ve la auditoría', pg_temp.n('select count(*) from public.audit_log') > 0);
select pg_temp.esperar('Se auditó la anulación de la venta (con quien la hizo)',
  pg_temp.n($q$select count(*) from public.audit_log where entity='sales' and action='UPDATE' and detail->>'status'='CANCELED' and user_id='c1000000-0000-0000-0000-000000000002'$q$) = 1);
select pg_temp.esperar('Se auditó el cambio de módulos', pg_temp.n($q$select count(*) from public.audit_log where entity='business_modules'$q$) >= 1);
select pg_temp.esperar('Se auditó el presupuesto (alta, cambio y baja)', pg_temp.n($q$select count(*) from public.audit_log where entity='budgets'$q$) >= 4);
select pg_temp.esperar('Se auditó el cierre de caja', pg_temp.n($q$select count(*) from public.audit_log where entity='cash_closings'$q$) = 2);
select pg_temp.esperar('Se auditó la liquidación', pg_temp.n($q$select count(*) from public.audit_log where entity='settlements'$q$) = 2);
select pg_temp.esperar('En un cambio se guardan solo los campos que cambiaron',
  pg_temp.n($q$select count(*) from public.audit_log where entity='sales' and action='UPDATE' and not (detail ? 'amount')$q$) = 1);
select pg_temp.esperar('La auditoría no se edita', pg_temp.falla($q$update public.audit_log set action = 'x'$q$));
select pg_temp.esperar('La auditoría no se borra', pg_temp.falla($q$delete from public.audit_log$q$));
select pg_temp.esperar('El dueño no escribe en la auditoría', pg_temp.falla($q$insert into public.audit_log (business_id,action,entity) values (current_setting('test.j')::uuid,'X','y')$q$));

-- ===== Otro negocio: aislamiento =====
reset role; set role authenticated; select set_config('request.jwt.claim.sub','d1000000-0000-0000-0000-000000000001',false) \gset
select pg_temp.esperar('Otro negocio no ve nada de esto',
  pg_temp.n('select count(*) from public.suppliers') + pg_temp.n('select count(*) from public.recurring_expenses') + pg_temp.n('select count(*) from public.cash_closings')
  + pg_temp.n('select count(*) from public.settlements') + pg_temp.n('select count(*) from public.budgets') + pg_temp.n($q$select count(*) from public.audit_log where business_id = current_setting('test.j')::uuid$q$) = 0);
select pg_temp.esperar('Otro negocio no cierra la caja ajena',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, (now() at time zone 'America/Argentina/Buenos_Aires')::date - 2, 0)$q$));
select pg_temp.esperar('Otro negocio no genera gastos recurrentes ajenos',
  pg_temp.falla($q$select public.generate_recurring_expenses(current_setting('test.j')::uuid)$q$));
select pg_temp.esperar('Otro negocio no ve reportes ajenos',
  pg_temp.n($q$select count(*) from public.serie_diaria(current_setting('test.j')::uuid, now() - interval '2 days', now() + interval '1 hour')$q$) = 0);

-- ===== Anónimo =====
reset role; set role anon;
select pg_temp.esperar('Anónimo NO lee auditoría', pg_temp.falla('select count(*) from public.audit_log'));
select pg_temp.esperar('Anónimo NO lee cierres', pg_temp.falla('select count(*) from public.cash_closings'));
select pg_temp.esperar('Anónimo NO lee liquidaciones', pg_temp.falla('select count(*) from public.settlements'));
select pg_temp.esperar('Anónimo NO cierra caja',
  pg_temp.falla($q$select public.close_day(current_setting('test.j')::uuid, now()::date, 0)$q$));
reset role;
\echo TODAS LAS PRUEBAS DE GESTION AVANZADA PASARON
