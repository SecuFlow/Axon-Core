-- Mandanten-ID explizit auf Profil und AI-Fall (Zuordnung zum Konzern).
alter table public.profiles
  add column if not exists tenant_id uuid;

alter table public.ai_cases
  add column if not exists tenant_id uuid;

update public.ai_cases
set tenant_id = company_id
where tenant_id is null and company_id is not null;

create index if not exists ai_cases_tenant_id_created_idx
  on public.ai_cases (tenant_id, created_at desc);

create index if not exists profiles_tenant_id_idx
  on public.profiles (tenant_id);
