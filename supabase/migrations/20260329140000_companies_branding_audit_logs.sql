-- Enterprise-Branding pro Mandant
alter table public.companies
  add column if not exists logo_url text;

alter table public.companies
  add column if not exists primary_color text;

comment on column public.companies.logo_url is 'URL zum Firmenlogo (Dashboard, White-Label).';
comment on column public.companies.primary_color is 'Hex-Farbe fuer Primaer-Buttons/UI, z. B. #0ea5e9.';

-- Audit-Trail fuer Mandanten (z. B. Reparaturfaelle)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid references public.companies (id) on delete set null,
  tenant_id uuid,
  user_id uuid,
  ai_case_id uuid references public.ai_cases (id) on delete set null,
  action text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb
);

-- Aeltere audit_logs ohne tenant_id o. a. (CREATE TABLE IF NOT EXISTS greift nicht)
alter table public.audit_logs add column if not exists created_at timestamptz;
alter table public.audit_logs add column if not exists company_id uuid;
alter table public.audit_logs add column if not exists tenant_id uuid;
alter table public.audit_logs add column if not exists user_id uuid;
alter table public.audit_logs add column if not exists ai_case_id uuid;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists description text;
alter table public.audit_logs add column if not exists metadata jsonb;

update public.audit_logs set created_at = coalesce(created_at, now()) where created_at is null;
update public.audit_logs set action = coalesce(action, '') where action is null;
update public.audit_logs set description = coalesce(description, '') where description is null;
update public.audit_logs set metadata = coalesce(metadata, '{}'::jsonb) where metadata is null;

alter table public.audit_logs alter column created_at set not null;
alter table public.audit_logs alter column action set not null;
alter table public.audit_logs alter column description set not null;
alter table public.audit_logs alter column metadata set not null;

create index if not exists audit_logs_company_id_created_idx
  on public.audit_logs (company_id, created_at desc);

create index if not exists audit_logs_tenant_id_created_idx
  on public.audit_logs (tenant_id, created_at desc);

create index if not exists audit_logs_ai_case_id_created_idx
  on public.audit_logs (ai_case_id, created_at desc);

alter table public.audit_logs enable row level security;
