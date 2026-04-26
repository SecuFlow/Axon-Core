-- Strikte Mandanten-Trennung fuer Kernobjekte.
create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists mandant_id uuid;

alter table if exists public.companies
  add column if not exists mandant_id uuid;

alter table if exists public.machines
  add column if not exists mandant_id uuid;

alter table if exists public.ai_cases
  add column if not exists mandant_id uuid;

alter table if exists public.team_members
  add column if not exists mandant_id uuid;

-- Backfill: bevorzugt bestehende tenant/company Felder.
update public.machines
set mandant_id = coalesce(mandant_id, tenant_id, company_id)
where mandant_id is null;

update public.ai_cases
set mandant_id = coalesce(mandant_id, tenant_id, company_id)
where mandant_id is null;

update public.team_members
set mandant_id = coalesce(mandant_id, tenant_id)
where mandant_id is null;

update public.profiles
set mandant_id = coalesce(mandant_id, tenant_id, company_id)
where mandant_id is null;

update public.companies
set mandant_id = coalesce(mandant_id, tenant_id)
where mandant_id is null;

-- Letzter Schutz: fehlende IDs erhalten eine UUID, damit jeder Datensatz eine mandant_id besitzt.
update public.machines set mandant_id = gen_random_uuid() where mandant_id is null;
update public.ai_cases set mandant_id = gen_random_uuid() where mandant_id is null;
update public.team_members set mandant_id = gen_random_uuid() where mandant_id is null;
update public.profiles set mandant_id = gen_random_uuid() where mandant_id is null;

alter table if exists public.machines
  alter column mandant_id set not null;
alter table if exists public.ai_cases
  alter column mandant_id set not null;
alter table if exists public.team_members
  alter column mandant_id set not null;
alter table if exists public.profiles
  alter column mandant_id set not null;

create index if not exists machines_mandant_id_idx on public.machines(mandant_id);
create index if not exists ai_cases_mandant_id_idx on public.ai_cases(mandant_id);
create index if not exists team_members_mandant_id_idx on public.team_members(mandant_id);
create index if not exists profiles_mandant_id_idx on public.profiles(mandant_id);

-- Konsistenz-Trigger: mandant_id folgt tenant_id/company_id.
create or replace function public.sync_mandant_id_from_legacy()
returns trigger
language plpgsql
as $$
begin
  if new.mandant_id is null then
    new.mandant_id := coalesce(new.tenant_id, new.company_id, gen_random_uuid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_machines_sync_mandant_id on public.machines;
create trigger trg_machines_sync_mandant_id
before insert or update on public.machines
for each row execute function public.sync_mandant_id_from_legacy();

drop trigger if exists trg_ai_cases_sync_mandant_id on public.ai_cases;
create trigger trg_ai_cases_sync_mandant_id
before insert or update on public.ai_cases
for each row execute function public.sync_mandant_id_from_legacy();

drop trigger if exists trg_team_members_sync_mandant_id on public.team_members;
create trigger trg_team_members_sync_mandant_id
before insert or update on public.team_members
for each row execute function public.sync_mandant_id_from_legacy();
