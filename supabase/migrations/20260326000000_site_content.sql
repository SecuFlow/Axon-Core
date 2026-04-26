-- Tabelle für Video-Metadaten (Dateien liegen im Storage-Bucket "Videos")
create table if not exists public.site_content (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  url text not null,
  title text not null,
  created_at timestamptz not null default now(),
  constraint site_content_type_check check (type in ('demo', 'pilot'))
);

create index if not exists site_content_type_created_idx
  on public.site_content (type, created_at desc);

comment on table public.site_content is 'Öffentliche Video-URLs; Storage-Bucket: Videos';

alter table public.site_content enable row level security;

-- Öffentliches Lesen (z. B. Landingpage mit Anon-Key)
create policy "site_content_select_public"
  on public.site_content
  for select
  to anon, authenticated
  using (true);

-- Schreibzugriff nur über Service Role (umgeht RLS)
