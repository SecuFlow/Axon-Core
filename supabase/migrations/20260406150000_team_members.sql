-- Team Management (System-Einspeisung) – non-destruktiv

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  name text not null,
  role text not null,
  email text,
  phone text,
  photo_url text,
  sort_order integer not null default 100
);

comment on table public.team_members is 'Teammitglieder für öffentliche Website, administrierbar über System-Einspeisung.';

create index if not exists team_members_sort_idx on public.team_members (sort_order asc, created_at desc);

alter table public.team_members enable row level security;

drop policy if exists "team_members_admin_all" on public.team_members;
create policy "team_members_admin_all"
  on public.team_members
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Storage Bucket für Team-Fotos (öffentlich, für Website-Render)
insert into storage.buckets (id, name, public)
values ('team', 'team', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read team bucket" on storage.objects;
create policy "Public read team bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'team');

