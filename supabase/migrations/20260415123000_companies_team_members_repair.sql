-- Repair migration for missing enterprise company fields and team management table.
-- Ziel:
-- 1) Fehler "column companies.employee_count does not exist" beheben
-- 2) Fehler "Could not find table public.team_members" beheben
-- 3) Mandanten-Logik (tenant scope) für Teamdaten absichern

-- =========================
-- Companies: Enterprise fields
-- =========================
alter table public.companies
  add column if not exists employee_count integer;

alter table public.companies
  add column if not exists revenue_eur bigint;

alter table public.companies
  add column if not exists market_segment text;

-- Tenant-Column defensiv absichern (falls Legacy-DB die fruehere Migration nicht hatte)
alter table public.companies
  add column if not exists tenant_id uuid;

update public.companies
set tenant_id = gen_random_uuid()
where tenant_id is null;

alter table public.companies
  alter column tenant_id set default gen_random_uuid();

alter table public.companies
  alter column tenant_id set not null;

create index if not exists companies_tenant_id_idx
  on public.companies (tenant_id);

create index if not exists companies_market_segment_idx
  on public.companies (market_segment);

-- =========================
-- Team management table
-- =========================
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Mandanten-Scope: entspricht companies.tenant_id
  tenant_id uuid,

  name text not null,
  role text not null,
  email text,
  phone text,
  photo_url text,
  sort_order integer not null default 100
);

-- Falls Tabelle schon existiert (ohne alle Spalten), non-destruktiv aufrüsten
alter table public.team_members add column if not exists created_at timestamptz not null default now();
alter table public.team_members add column if not exists updated_at timestamptz not null default now();
alter table public.team_members add column if not exists tenant_id uuid;
alter table public.team_members add column if not exists name text;
alter table public.team_members add column if not exists role text;
alter table public.team_members add column if not exists email text;
alter table public.team_members add column if not exists phone text;
alter table public.team_members add column if not exists photo_url text;
alter table public.team_members add column if not exists sort_order integer not null default 100;

-- Not-Null nur setzen, wenn Legacy-Daten bereits valide sind.
update public.team_members
set name = coalesce(nullif(trim(name), ''), 'Unbekannt')
where name is null or trim(name) = '';

update public.team_members
set role = coalesce(nullif(trim(role), ''), 'Team')
where role is null or trim(role) = '';

alter table public.team_members alter column name set not null;
alter table public.team_members alter column role set not null;

comment on table public.team_members is
  'Teammitglieder fuer oeffentliche Website / Team-Verwaltung; tenant_id folgt der Mandanten-Logik.';

create index if not exists team_members_sort_idx
  on public.team_members (sort_order asc, created_at desc);

create index if not exists team_members_tenant_sort_idx
  on public.team_members (tenant_id, sort_order asc, created_at desc);

alter table public.team_members enable row level security;

-- Admin full access (System/HQ)
drop policy if exists "team_members_admin_all" on public.team_members;
create policy "team_members_admin_all"
  on public.team_members
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Tenant-aware access for company managers/admins (future-safe, service-role unaffected)
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

-- Public website read:
-- - global records (tenant_id is null)
-- - tenant records nur im eigenen auth-Scope
drop policy if exists "team_members_public_read" on public.team_members;
create policy "team_members_public_read"
  on public.team_members
  for select
  to public
  using (
    tenant_id is null
    or tenant_id = public.current_user_company_id()
  );

-- Storage bucket fuer Team-Fotos (idempotent)
insert into storage.buckets (id, name, public)
values ('team', 'team', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read team bucket" on storage.objects;
create policy "Public read team bucket"
  on storage.objects for select
  to public
  using (bucket_id = 'team');

-- PostgREST schema cache refresh
notify pgrst, 'reload schema';
