-- Standorte/Mandate robust absichern und Team-Rollen strikt normalisieren.

-- 1) Mandate/Standorte: keine Nullwerte in geschützten Kernspalten.
alter table if exists public.mandates
  alter column tenant_id set not null;
alter table if exists public.mandates
  alter column title set not null;

alter table if exists public.locations
  alter column company_id set not null;
alter table if exists public.locations
  alter column name set not null;

-- 2) Zusätzliche Indizes für schnelle Tenant-/Mandatsabfragen.
create index if not exists mandates_tenant_title_idx
  on public.mandates (tenant_id, title);

create index if not exists locations_company_name_idx
  on public.locations (company_id, name);

-- 3) Team-Mitglieder: genau eine Rolle aus Admin/Mitarbeiter/Manager.
alter table if exists public.team_members
  alter column mandant_id set not null;
alter table if exists public.team_members
  alter column role set not null;

-- Bestehende Legacy-Werte auf das neue 3-Rollen-System mappen.
update public.team_members
set role = case
  when lower(trim(role)) in ('admin') then 'admin'
  when lower(trim(role)) in ('manager') then 'manager'
  else 'mitarbeiter'
end;

alter table if exists public.team_members
  drop constraint if exists team_members_role_allowed_chk;
alter table if exists public.team_members
  add constraint team_members_role_allowed_chk
  check (lower(trim(role)) in ('admin', 'mitarbeiter', 'manager'));

-- Mandantenkonsistenz: tenant_id folgt immer mandant_id.
create or replace function public.team_members_enforce_mandant()
returns trigger
language plpgsql
as $$
begin
  if new.mandant_id is null then
    raise exception 'team_members.mandant_id darf nicht null sein';
  end if;
  new.tenant_id := new.mandant_id;
  return new;
end;
$$;

drop trigger if exists trg_team_members_enforce_mandant on public.team_members;
create trigger trg_team_members_enforce_mandant
before insert or update on public.team_members
for each row execute function public.team_members_enforce_mandant();
