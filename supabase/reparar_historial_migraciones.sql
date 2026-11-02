-- Marca como "ya aplicadas" las migraciones que pegaste a mano. NO ejecuta ninguna migración ni toca tus datos.
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261025000001', 'negocios_y_membresias'),
  ('20261025000002', 'ventas_y_comisiones'),
  ('20261027000003', 'gastos'),
  ('20261028000004', 'correcciones_ventas'),
  ('20261028000005', 'usuario_de_equipo'),
  ('20261028000006', 'modulos_y_widgets'),
  ('20261028000007', 'agenda_clientes_metas'),
  ('20261029000008', 'gestion_avanzada'),
  ('20261029000009', 'color_de_enfasis'),
  ('20261029000010', 'editar_turnos'),
  ('20261029000011', 'marca_propia'),
  ('20261030000012', 'logos_lectura'),
  ('20261031000013', 'colores_de_marca'),
  ('20261031000014', 'metricas_visuales'),
  ('20261101000015', 'pausa_y_administracion')
on conflict (version) do nothing;
