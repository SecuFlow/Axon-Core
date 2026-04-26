-- Critical repairs:
-- 1) ensure companies.employee_count exists
-- 2) ensure public.team_members exists and tenant-aware
-- 3) introduce public.mandates as successor structure for old locations/standorte

-- ---------------------------------------
-- 1) companies.employee_count
-- ---------------------------------------
alter table public.companies
  add column if not exists employee_count integer;

-- ---------------------------------------
-- 2) team_members (tenant-aware)
-- ---------------------------------------
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid,
  name text not null,
  role text not null,
  email text,
  phone text,
  photo_url text,
  sort_order integer not null default 100
);

alter table public.team_members add column if not exists tenant_id uuid;
alter table public.team_members add column if not exists name text;
alter table public.team_members add column if not exists role text;
alter table public.team_members add column if not exists email text;
alter table public.team_members add column if not exists phone text;
alter table public.team_members add column if not exists photo_url text;
alter table public.team_members add column if not exists sort_order integer not null default 100;
alter table public.team_members add column if not exists updated_at timestamptz not null default now();
alter table public.team_members add column if not exists created_at timestamptz not null default now();

update public.team_members
set name = coalesce(nullif(trim(name), ''), 'Unbekannt')
where name is null or trim(name) = '';

update public.team_members
set role = coalesce(nullif(trim(role), ''), 'Team')
where role is null or trim(role) = '';

alter table public.team_members alter column name set not null;
alter table public.team_members alter column role set not null;

create index if not exists team_members_sort_idx
  on public.team_members (sort_order asc, created_at desc);
create index if not exists team_members_tenant_sort_idx
  on public.team_members (tenant_id, sort_order asc, created_at desc);

alter table public.team_members enable row level security;

drop policy if exists "team_members_admin_all" on public.team_members;
create policy "team_members_admin_all"
  on public.team_members
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "team_members_company_select" on public.team_members;
create policy "team_members_company_select"
  on public.team_members
  for select
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  );

drop policy if exists "team_members_company_write" on public.team_members;
create policy "team_members_company_write"
  on public.team_members
  for all
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  )
  with check (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  );

drop policy if exists "team_members_public_read" on public.team_members;
create policy "team_members_public_read"
  on public.team_members
  for select
  to public
  using (tenant_id is null or tenant_id = public.current_user_company_id());

-- ---------------------------------------
-- 3) mandates table (new backend structure)
-- ---------------------------------------
create table if not exists public.mandates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mandanten-Scope (gleiches Modell wie bisher in locations.company_id)
  tenant_id uuid not null,
  title text not null,
  description text,

  -- Legacy-Bruecke zu alten Standort-Daten
  legacy_location_id uuid references public.locations (id) on delete set null,

  -- optionaler exklusiver Account-Binder (eindeutig, verhindert Mehrfachnutzung)
  account_user_id uuid unique references auth.users (id) on delete set null
);

alter table public.mandates add column if not exists tenant_id uuid;
alter table public.mandates add column if not exists title text;
alter table public.mandates add column if not exists description text;
alter table public.mandates add column if not exists legacy_location_id uuid;
alter table public.mandates add column if not exists account_user_id uuid;
alter table public.mandates add column if not exists updated_at timestamptz not null default now();
alter table public.mandates add column if not exists created_at timestamptz not null default now();

update public.mandates
set title = coalesce(nullif(trim(title), ''), 'Mandat')
where title is null or trim(title) = '';

alter table public.mandates alter column tenant_id set not null;
alter table public.mandates alter column title set not null;

create index if not exists mandates_tenant_idx
  on public.mandates (tenant_id, created_at desc);
create index if not exists mandates_legacy_location_idx
  on public.mandates (legacy_location_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mandates_tenant_title_unique'
  ) then
    alter table public.mandates
      add constraint mandates_tenant_title_unique unique (tenant_id, title);
  end if;
end $$;

-- Backfill aus alten locations (non-destructive)
insert into public.mandates (tenant_id, title, description, legacy_location_id)
select
  l.company_id as tenant_id,
  coalesce(nullif(trim(l.name), ''), 'Mandat') as title,
  nullif(trim(l.address), '') as description,
  l.id as legacy_location_id
from public.locations l
where l.company_id is not null
on conflict (tenant_id, title) do nothing;

alter table public.mandates enable row level security;

drop policy if exists "mandates_admin_all" on public.mandates;
create policy "mandates_admin_all"
  on public.mandates
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "mandates_company_select" on public.mandates;
create policy "mandates_company_select"
  on public.mandates
  for select
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  );

drop policy if exists "mandates_company_write" on public.mandates;
create policy "mandates_company_write"
  on public.mandates
  for all
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  )
  with check (
    public.is_company_manager_or_admin()
    and tenant_id = public.current_user_company_id()
  );

notify pgrst, 'reload schema';
