-- =========================================================================
-- Leadmaschine Pivot: Google-Dork (Matrix-Riss) → Apollo.io API Discovery
-- =========================================================================
-- Operativer Schwenk:
--   1) Matrix-Riss + LinkedIn-Prospects-Workflow wird komplett entfernt.
--   2) Apollo.io ersetzt die manuelle Google-Dork-Suche durch automatisierte
--      People Discovery + Email-Enrichment.
--   3) Daily Hard-Cap wird vom hartcodierten 5/Tag auf konfigurierbare
--      30/Tag (Default 20 Enterprise + 10 SMB) gehoben.
--      WICHTIG: Diese Erhoehung ist eine bewusste Geschaeftsentscheidung des
--      Plattform-Inhabers; das UWG-§7-Risiko (B2B-Direktansprache an konkrete
--      Entscheider ohne mutmassliche Einwilligung) bleibt bestehen.
--      Schutzschichten (isGenericMailbox-Block, manager_name-Pflicht,
--      auto_send_blocked pro Lead) bleiben unveraendert aktiv.
--
-- Idempotent. Bei Wiederholung greift `if exists` / `if not exists`.

-- =========================================================================
-- 1) Alte Matrix-Riss-Strukturen droppen
-- =========================================================================
-- linkedin_prospects wird via FK in content_pool referenziert; CASCADE
-- entfernt diesen FK in einem Schritt. content_pool selbst bleibt erhalten,
-- weil das Social Center weiterhin posts (ohne Prospect-Bezug) verwaltet.
drop table if exists public.linkedin_prospects cascade;
drop table if exists public.leadmaschine_targets cascade;

-- content_pool wird auf "post-only" reduziert. Comment-Drafts hingen am
-- alten Prospect-Konzept; sie verlieren ohne linkedin_prospects ihren
-- Anker. Bestehende Comment-Eintraege bleiben rohweise erhalten, damit
-- sie ggf. archivierbar sind, werden aber nicht mehr in der UI angezeigt.
alter table public.content_pool
  drop column if exists target_prospect_id,
  drop column if exists source_post_text;

-- =========================================================================
-- 2) Apollo-Discovery: Felder an leadmaschine_settings + neue Tabellen
-- =========================================================================
alter table public.leadmaschine_settings
  drop column if exists lead_daily_cap_locked;

alter table public.leadmaschine_settings
  add column if not exists apollo_enabled boolean not null default false,
  add column if not exists apollo_leads_per_day_enterprise integer not null default 20,
  add column if not exists apollo_leads_per_day_smb integer not null default 10,
  add column if not exists apollo_person_titles_enterprise text[] not null
    default array['Werkleiter','Standortleiter','Plant Manager','Betriebsleiter','Werksleiter','Production Manager']::text[],
  add column if not exists apollo_person_titles_smb text[] not null
    default array['Geschäftsführer','Inhaber','CEO','Owner','Founder','Geschäftsleitung']::text[],
  add column if not exists apollo_person_locations text[] not null
    default array['Germany','Austria','Switzerland']::text[],
  add column if not exists apollo_person_seniorities text[] not null
    default array['c_suite','vp','head','director','manager','owner','founder']::text[],
  add column if not exists apollo_org_employee_min integer not null default 100,
  add column if not exists apollo_org_employee_max integer not null default 5000,
  add column if not exists apollo_org_employee_min_smb integer not null default 5,
  add column if not exists apollo_org_employee_max_smb integer not null default 99,
  add column if not exists apollo_industries text[] not null default array[]::text[],
  add column if not exists apollo_industries_smb text[] not null default array[]::text[],
  add column if not exists apollo_reveal_personal_emails boolean not null default false;

comment on column public.leadmaschine_settings.apollo_enabled is
  'Master-Switch fuer Apollo-Discovery. Wenn false, laeuft der /api/cron/leadmaschine-discover Cron im No-Op-Modus.';
comment on column public.leadmaschine_settings.apollo_leads_per_day_enterprise is
  'Wieviele Apollo-Discovery-Leads pro Tag im Enterprise-Segment angelegt werden. Speist die mail_1-Pipeline.';
comment on column public.leadmaschine_settings.apollo_leads_per_day_smb is
  'Wieviele Apollo-Discovery-Leads pro Tag im SMB-Segment angelegt werden.';

-- Hard-Cap im Code wird auf 30 gehoben (siehe leadmaschineTiming.ts).
-- DB-Werte fuer Tages-Cap werden ab jetzt aus dem Admin-UI editierbar.
update public.leadmaschine_settings
set
  leads_per_day_enterprise = greatest(coalesce(leads_per_day_enterprise, 0), 20),
  leads_per_day_smb = greatest(coalesce(leads_per_day_smb, 0), 10),
  updated_at = now();

-- =========================================================================
-- 3) leads.apollo_person_id (Idempotenz fuer Apollo-Insert)
-- =========================================================================
alter table public.leads
  add column if not exists apollo_person_id text;

comment on column public.leads.apollo_person_id is
  'Apollo.io Person-ID (z.B. "64a7ff0c..."). Wird beim Apollo-Discovery-Run gesetzt und mit UNIQUE-Index gegen Duplikate gesichert.';

create unique index if not exists leads_apollo_person_id_uq
  on public.leads (apollo_person_id)
  where apollo_person_id is not null;

create index if not exists leads_apollo_person_id_idx
  on public.leads (apollo_person_id)
  where apollo_person_id is not null;

-- =========================================================================
-- 4) apollo_discovery_runs: Audit/Idempotenz pro Cron-Lauf
-- =========================================================================
create table if not exists public.apollo_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,

  -- 'cron' | 'manual'
  trigger text not null default 'cron',

  -- Was der Run versucht hat
  segment text not null check (segment in ('enterprise', 'smb')),
  target_count integer not null default 0,

  -- Ergebnis
  searched_count integer not null default 0,
  enriched_count integer not null default 0,
  inserted_count integer not null default 0,
  skipped_duplicate_count integer not null default 0,
  skipped_no_email_count integer not null default 0,
  skipped_generic_mailbox_count integer not null default 0,

  -- Apollo-Credit-Verbrauch (geschaetzt)
  apollo_credits_used integer not null default 0,

  -- Fehler-Details (truncated)
  error_message text,

  -- Snapshot der Filter-Konfiguration zum Zeitpunkt des Runs (Audit/Reproduzierbarkeit)
  filter_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists apollo_discovery_runs_started_idx
  on public.apollo_discovery_runs (started_at desc);

create index if not exists apollo_discovery_runs_segment_idx
  on public.apollo_discovery_runs (segment, started_at desc);

comment on table public.apollo_discovery_runs is
  'Audit-Log fuer Apollo-Discovery-Laeufe (Cron oder manuell). Pro Run ein Eintrag mit Filter-Snapshot, Ergebnissen und Credit-Verbrauch.';
comment on column public.apollo_discovery_runs.filter_snapshot is
  'JSON-Snapshot der Apollo-Filter zum Zeitpunkt des Runs (person_titles, locations, employee_range, ...). Audit + Reproduzierbarkeit.';

alter table public.apollo_discovery_runs enable row level security;

drop policy if exists "apollo_discovery_runs_admin_all" on public.apollo_discovery_runs;
create policy "apollo_discovery_runs_admin_all"
  on public.apollo_discovery_runs
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
