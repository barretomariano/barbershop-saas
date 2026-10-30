-- Corrección de la migración 11: no se podía subir el logo de la barbería.
-- Causa: subir con "upsert" (reemplazar el logo anterior) y quitar el logo necesitan que Storage pueda LEER
-- las filas de storage.objects, y la migración 11 solo creó políticas de insertar, actualizar y borrar.
-- Acá se agrega la lectura (los logos son públicos, igual que el bucket) y se reafirma el bucket y las políticas
-- del dueño. Se puede correr más de una vez. En un Postgres de pruebas sin Storage no hace nada.
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 1048576, array['image/png'])
  on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

  drop policy if exists logos_lectura on storage.objects;
  create policy logos_lectura on storage.objects for select to anon, authenticated
    using (bucket_id = 'logos');

  drop policy if exists logos_owner_insert on storage.objects;
  drop policy if exists logos_owner_update on storage.objects;
  drop policy if exists logos_owner_delete on storage.objects;
  create policy logos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
  create policy logos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]))
    with check (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
  create policy logos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
end $$;
