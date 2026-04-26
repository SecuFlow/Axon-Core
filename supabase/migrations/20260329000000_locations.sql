-- Werke / Standorte pro Mandant (company_id = gleicher Scope wie machines.company_id = tenant_id).
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null,
  name text not null,
  address text
);

create index if not exists locations_company_id_idx
  on public.locations (company_id);

alter table public.machines
  add column if not exists location_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'machines_location_id_fkey'
  ) then
    alter table public.machines
      add constraint machines_location_id_fkey
      foreign key (location_id) references public.locations (id)
      on delete set null;
  end if;
end $$;

create index if not exists machines_location_id_idx
  on public.machines (location_id);

comment on table public.locations is 'Werke/Standorte; company_id entspricht machines.company_id (Mandant).';
