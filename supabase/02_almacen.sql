-- =====================================================================
--  EL RESACÓN · Almacén de fotos (Supabase Storage)
--  Ejecutar DESPUÉS de 01_esquema.sql. Se puede re-ejecutar.
--
--  Carpetas (buckets), todas privadas:
--   · tickets   -> tickets/<id del usuario>/foto.jpg  (sube cada uno lo suyo)
--                  Lo ve: quien lo subió, el admin y, si el ticket ya está
--                  en la lista de la compra o en los gastos del bote, todos
--                  los miembros (transparencia).
--   · capturas  -> capturas/<id del usuario>/captura.jpg  (justificante de pago)
--                  Lo ve: quien lo subió y el admin.
--   · portadas  -> fotos de portada de eventos. Sube el admin, ven todos.
--   · fotos     -> fotos de perfil: fotos/<id del usuario>/... Ven todos.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('tickets',  'tickets',  false, 8388608, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('capturas', 'capturas', false, 8388608, array['image/jpeg','image/png','image/webp','image/heic']),
  ('portadas', 'portadas', false, 8388608, array['image/jpeg','image/png','image/webp']),
  ('fotos',    'fotos',    false, 4194304, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "resacon tickets leer"     on storage.objects;
drop policy if exists "resacon tickets subir"    on storage.objects;
drop policy if exists "resacon tickets borrar"   on storage.objects;
drop policy if exists "resacon capturas leer"    on storage.objects;
drop policy if exists "resacon capturas subir"   on storage.objects;
drop policy if exists "resacon portadas leer"    on storage.objects;
drop policy if exists "resacon fotos leer"       on storage.objects;
drop policy if exists "resacon fotos subir"      on storage.objects;
drop policy if exists "resacon fotos cambiar"    on storage.objects;
drop policy if exists "resacon fotos borrar"     on storage.objects;
drop policy if exists "resacon admin todo"       on storage.objects;

-- El administrador puede hacerlo todo en estas cuatro carpetas
create policy "resacon admin todo" on storage.objects for all to authenticated
  using (bucket_id in ('tickets','capturas','portadas','fotos') and public.is_admin())
  with check (bucket_id in ('tickets','capturas','portadas','fotos') and public.is_admin());

-- TICKETS
create policy "resacon tickets leer" on storage.objects for select to authenticated using (
  bucket_id = 'tickets' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or (public.es_miembro() and (
         exists (select 1 from public.purchase_items pi where pi.ticket_url = storage.objects.name)
      or exists (select 1 from public.pot_movements pm where pm.tipo = 'gasto' and pm.ticket_url = storage.objects.name)))
  ));
create policy "resacon tickets subir" on storage.objects for insert to authenticated with check (
  bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text and public.es_miembro());
create policy "resacon tickets borrar" on storage.objects for delete to authenticated using (
  bucket_id = 'tickets' and (storage.foldername(name))[1] = auth.uid()::text);

-- CAPTURAS DE PAGO
create policy "resacon capturas leer" on storage.objects for select to authenticated using (
  bucket_id = 'capturas' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resacon capturas subir" on storage.objects for insert to authenticated with check (
  bucket_id = 'capturas' and (storage.foldername(name))[1] = auth.uid()::text and public.es_miembro());

-- PORTADAS DE EVENTOS (sube el admin, con la política "admin todo")
create policy "resacon portadas leer" on storage.objects for select to authenticated using (
  bucket_id = 'portadas' and public.es_miembro());

-- FOTOS DE PERFIL
create policy "resacon fotos leer" on storage.objects for select to authenticated using (
  bucket_id = 'fotos' and public.es_miembro());
create policy "resacon fotos subir" on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resacon fotos cambiar" on storage.objects for update to authenticated using (
  bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "resacon fotos borrar" on storage.objects for delete to authenticated using (
  bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
