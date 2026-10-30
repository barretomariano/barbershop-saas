-- Marca propia de cada barbería: nombre, dirección (slug) y logo.
-- El link de la barbería es  <sitio>/b/<slug>  y desde ahí la app se instala con su nombre y su ícono.
-- El logo vive en el bucket público "logos" (Supabase Storage), carpeta = id del negocio.
-- Solo el dueño puede cambiar nombre, slug y logo. Cualquiera (sin iniciar sesión) puede leer la marca pública
-- de un slug: nombre, color y versión del logo; nada más.

alter table public.businesses
  add column if not exists slug text,
  add column if not exists logo_version integer not null default 0 check (logo_version >= 0);

create unique index if not exists businesses_slug_key on public.businesses (slug);
alter table public.businesses drop constraint if exists businesses_slug_formato;
alter table public.businesses add constraint businesses_slug_formato
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$');

-- Cambiar nombre y dirección. Devuelve mensajes claros si el slug no sirve.
create function public.set_branding(p_business uuid, p_name text, p_slug text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_slug text := nullif(lower(btrim(p_slug)), '');
  v_reservados text[] := array['app', 'api', 'admin', 'b', 'login', 'ingresar', 'www', 'static', 'assets', 'icons', 'sw', 'manifest', 'soporte', 'ayuda'];
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if not private.has_role(p_business, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede cambiar la marca de la barbería.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres.';
  end if;
  if v_slug is not null then
    if v_slug !~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' then
      raise exception 'La dirección debe tener entre 3 y 30 caracteres: letras minúsculas, números y guiones (sin espacios ni acentos).';
    end if;
    if v_slug = any (v_reservados) then raise exception 'Esa dirección está reservada. Elegí otra.'; end if;
    if exists (select 1 from public.businesses b where b.slug = v_slug and b.id <> p_business) then
      raise exception 'Esa dirección ya la usa otra barbería. Probá con otra.';
    end if;
  end if;
  update public.businesses set name = btrim(p_name), slug = v_slug where id = p_business;
end $$;

-- Registrar que se subió (true) o se quitó (false) el logo. Cambia la versión para que nadie vea el logo viejo en caché.
create function public.set_logo(p_business uuid, p_has boolean)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare v integer;
begin
  if auth.uid() is null then raise exception 'Iniciá sesión para continuar.'; end if;
  if not private.has_role(p_business, array['OWNER']::public.business_role[]) then
    raise exception 'Solo el dueño puede cambiar el logo.';
  end if;
  update public.businesses set logo_version = case when p_has then logo_version + 1 else 0 end
   where id = p_business returning logo_version into v;
  return v;
end $$;

-- Marca pública de un slug (la usa la página de ingreso y el manifiesto de la PWA).
create function public.branding_publico(p_slug text)
returns table (business_id uuid, name text, accent text, logo_version integer)
language sql stable security definer set search_path = ''
as $$
  select b.id, b.name, b.accent, b.logo_version from public.businesses b where b.slug = lower(btrim(p_slug)) limit 1;
$$;

revoke all on function public.set_branding(uuid, text, text) from public, anon;
revoke all on function public.set_logo(uuid, boolean) from public, anon;
revoke all on function public.branding_publico(text) from public;
grant execute on function public.set_branding(uuid, text, text) to authenticated;
grant execute on function public.set_logo(uuid, boolean) to authenticated;
grant execute on function public.branding_publico(text) to anon, authenticated;

-- Storage: bucket público de logos (PNG, hasta 1 MB). Solo el dueño escribe en la carpeta de su negocio.
-- En un Postgres de pruebas sin Storage este bloque no hace nada.
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', true, 1048576, array['image/png'])
  on conflict (id) do update set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/png'];

  drop policy if exists logos_owner_insert on storage.objects;
  drop policy if exists logos_owner_update on storage.objects;
  drop policy if exists logos_owner_delete on storage.objects;
  create policy logos_owner_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
  create policy logos_owner_update on storage.objects for update to authenticated
    using (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
  create policy logos_owner_delete on storage.objects for delete to authenticated
    using (bucket_id = 'logos' and private.has_role(((storage.foldername(name))[1])::uuid, array['OWNER']::public.business_role[]));
end $$;
