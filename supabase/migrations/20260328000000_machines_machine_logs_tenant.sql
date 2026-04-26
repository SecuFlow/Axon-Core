-- Mandanten-Id (mehrere Nutzer einer Organisation teilen sich tenant_id).
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

-- Maschinen-Inventar pro Mandant (Upsert ueber company_id + serial_number).
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null,
  serial_number text not null,
  name text,
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'offline')),
  unique (company_id, serial_number)
);

create index if not exists machines_company_id_idx
  on public.machines (company_id);

create index if not exists machines_status_idx
  on public.machines (status);

-- Waartungs-/Status-Historie.
create table if not exists public.machine_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  machine_id uuid not null references public.machines (id) on delete cascade,
  user_id uuid not null,
  ai_case_id uuid,
  action text not null,
  detail text,
  status_after text
    check (status_after is null or status_after in ('active', 'maintenance', 'offline'))
);

-- Aeltere machine_logs ohne ai_case_id (CREATE TABLE IF NOT EXISTS aendert bestehende Tabellen nicht)
alter table public.machine_logs add column if not exists ai_case_id uuid;

create index if not exists machine_logs_machine_created_idx
  on public.machine_logs (machine_id, created_at desc);

-- ai_cases: Verknuepfung Inventar + schneller Mandantenfilter.
alter table public.ai_cases
  add column if not exists machine_id uuid;

alter table public.ai_cases
  add column if not exists company_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ai_cases_machine_id_fkey'
  ) then
    alter table public.ai_cases
      add constraint ai_cases_machine_id_fkey
      foreign key (machine_id) references public.machines (id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'machine_logs_ai_case_id_fkey'
  ) then
    alter table public.machine_logs
      add constraint machine_logs_ai_case_id_fkey
      foreign key (ai_case_id) references public.ai_cases (id)
      on delete set null;
  end if;
end $$;

create index if not exists ai_cases_company_id_created_idx
  on public.ai_cases (company_id, created_at desc);
