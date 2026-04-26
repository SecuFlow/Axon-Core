-- Leadmaschine: manuelle Lead-Anlage (Standort-basiert) – neue Felder + Dedupe-Update
-- Additive, idempotente Migration. Keine Datenverluste.

alter table public.leads
  add column if not exists manager_name text;

alter table public.leads
  add column if not exists linkedin_url text;

alter table public.leads
  add column if not exists corporate_group_name text;

alter table public.leads
  add column if not exists location_name text;

alter table public.leads
  add column if not exists phone text;

alter table public.leads
  add column if not exists department text;

alter table public.leads
  add column if not exists research_source text;

comment on column public.leads.manager_name is 'Name des Standort-Managers (UWG §7: konkreter Entscheider, keine Info@-Adresse).';
comment on column public.leads.linkedin_url is 'LinkedIn-Profil des Managers, falls recherchiert.';
comment on column public.leads.corporate_group_name is 'Name des Konzerns (z. B. "Siemens"). Mehrere Standorte teilen sich einen Konzernnamen.';
comment on column public.leads.location_name is 'Name/Bezeichnung des Standorts (z. B. "Werk München").';
comment on column public.leads.phone is 'Optional: Telefonnummer des Managers.';
comment on column public.leads.department is 'Optional: Abteilung/Funktion des Managers.';
comment on column public.leads.research_source is 'Optional: Quelle/Datum der manuellen Recherche (z. B. "LinkedIn Sales Navigator 2026-04-22").';

-- Hilfs-Indizes für UI-Filter / Suche
create index if not exists leads_corporate_group_idx
  on public.leads (corporate_group_name);
create index if not exists leads_location_idx
  on public.leads (location_name);
