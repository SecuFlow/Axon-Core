-- AxonCore API-Modul: externe Integrationen pro Mandant.
-- Ziel:
-- 1) Konzerne koppeln Buchhaltungs-Software (DATEV, Lexware, ...) und
--    Maschinen-APIs (Siemens MindSphere, OPC-UA, MQTT, ...) mit AxonCore.
-- 2) Wartungsdashboard zeigt pro Maschine, ob sie an eine Integration gekoppelt ist.

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  mandant_id uuid not null,
  company_id uuid,
  category text not null
    check (category in ('accounting', 'machines', 'crm', 'other')),
  provider text not null,
  display_name text,
  status text not null default 'connected'
    check (status in ('connected', 'paused', 'error')),
  api_endpoint text,
  api_key_hint text,
  notes text,
  meta jsonb not null default '{}'::jsonb,
  created_by uuid,
  last_sync_at timestamptz
);

create index if not exists integrations_mandant_id_idx
  on public.integrations (mandant_id);

create index if not exists integrations_mandant_category_idx
  on public.integrations (mandant_id, category);

create index if not exists integrations_company_id_idx
  on public.integrations (company_id);

-- Maschinen-Kopplung: jede Maschine kann an 1 Integration hängen.
alter table public.machines
  add column if not exists integration_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'machines_integration_id_fkey'
  ) then
    alter table public.machines
      add constraint machines_integration_id_fkey
      foreign key (integration_id) references public.integrations (id)
      on delete set null;
  end if;
end $$;

create index if not exists machines_integration_id_idx
  on public.machines (integration_id);

-- RLS: Mandanten-Scope lesen/schreiben.
alter table public.integrations enable row level security;

drop policy if exists integrations_mandant_read on public.integrations;
create policy integrations_mandant_read
  on public.integrations
  for select
  using (
    mandant_id in (
      select coalesce(mandant_id, tenant_id, company_id)
      from public.profiles
      where id = auth.uid()
      union
      select tenant_id from public.companies where user_id = auth.uid()
    )
  );

drop policy if exists integrations_mandant_write on public.integrations;
create policy integrations_mandant_write
  on public.integrations
  for all
  using (
    mandant_id in (
      select coalesce(mandant_id, tenant_id, company_id)
      from public.profiles
      where id = auth.uid()
      union
      select tenant_id from public.companies where user_id = auth.uid()
    )
  )
  with check (
    mandant_id in (
      select coalesce(mandant_id, tenant_id, company_id)
      from public.profiles
      where id = auth.uid()
      union
      select tenant_id from public.companies where user_id = auth.uid()
    )
  );

-- updated_at automatisch pflegen.
create or replace function public.integrations_touch_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists integrations_touch_updated_at on public.integrations;
create trigger integrations_touch_updated_at
  before update on public.integrations
  for each row
  execute function public.integrations_touch_updated_at();
