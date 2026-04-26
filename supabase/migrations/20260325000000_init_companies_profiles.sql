-- Baseline-Schema für lokale Supabase-Starts.
-- In Hosted-Projekten existieren `companies`/`profiles` oft schon; lokal müssen sie vor späteren ALTERs existieren.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Anzeige / Branding
  name text,
  brand_name text,
  logo_url text,
  primary_color text,
  branche text,

  -- Konto/Owner
  user_id uuid,
  role text not null default 'user',
  is_subscribed boolean not null default false,

  -- Demo-Management (Admin)
  demo_slug text,
  is_demo_active boolean not null default false,
  show_cta boolean not null default true
);

-- Bestehende `companies`-Tabellen: `CREATE TABLE IF NOT EXISTS` ergänzt keine Spalten.
-- Ohne diesen Block schlägt z. B. `CREATE INDEX ... (demo_slug)` fehl (42703).
alter table public.companies add column if not exists name text;
alter table public.companies add column if not exists brand_name text;
alter table public.companies add column if not exists logo_url text;
alter table public.companies add column if not exists primary_color text;
alter table public.companies add column if not exists branche text;
alter table public.companies add column if not exists user_id uuid;
alter table public.companies add column if not exists role text not null default 'user';
alter table public.companies add column if not exists is_subscribed boolean not null default false;
alter table public.companies add column if not exists demo_slug text;
alter table public.companies add column if not exists is_demo_active boolean not null default false;
alter table public.companies add column if not exists show_cta boolean not null default true;

-- Oft existiert ein FK auf auth.users in Hosted-Setups; lokal halten wir es optional/best-effort.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_user_id_fkey') then
    alter table public.companies
      add constraint companies_user_id_fkey
      foreign key (user_id) references auth.users (id)
      on delete set null;
  end if;
exception when undefined_table then
  -- auth.users evtl. noch nicht verfügbar → ignoriere, lokale CLI legt es i.d.R. aber an.
end $$;

create index if not exists companies_user_id_idx on public.companies (user_id);
create index if not exists companies_demo_slug_idx on public.companies (demo_slug);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null default 'user',

  -- Konzern/Scope
  company_id uuid references public.companies (id) on delete set null,
  tenant_id uuid,

  -- Worker / Standort
  location_id uuid
);

create index if not exists profiles_company_id_idx on public.profiles (company_id);
create index if not exists profiles_tenant_id_idx on public.profiles (tenant_id);

