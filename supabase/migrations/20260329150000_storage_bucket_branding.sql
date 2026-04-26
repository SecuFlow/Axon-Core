-- Öffentlicher Bucket für Firmenlogos (Pfad z. B. logo_<company_id>.png)
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do update set public = excluded.public;

-- Öffentliches Lesen für <img src="...">
drop policy if exists "Public read branding bucket" on storage.objects;
create policy "Public read branding bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'branding');
