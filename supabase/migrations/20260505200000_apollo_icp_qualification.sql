-- =========================================================================
-- Apollo ICP-Qualifikation: KI-Vorauswahl + Echtheits-Check
-- =========================================================================
-- Erweitert die Apollo-Discovery um zwei zusaetzliche Filter-Stufen vor dem
-- Insert in `leads`:
--   1) Echtheits-Check (Apollo email_status, Domain-MX, Datenvollstaendigkeit)
--   2) LLM-basierte ICP-Qualifikation (Branche/Umsatz/Mindset)
-- Ziel: lieber 10 perfekte Kontakte als 500 wertlose.
--
-- Idempotent. Bei Wiederholung greifen `if not exists` auf alle Spalten und
-- der Tabellen-Counter.

-- =========================================================================
-- 1) ICP-Settings auf leadmaschine_settings
-- =========================================================================
alter table public.leadmaschine_settings
  -- Master-Switch fuer LLM-Qualifikation. Wenn false, wird der Echtheits-
  -- Check trotzdem ausgefuehrt; nur die KI-Vorauswahl wird uebersprungen.
  add column if not exists apollo_qualification_enabled boolean not null default true,

  -- Mindest-Score (1-10) fuer Insert. Default 7 = ueberdurchschnittlich.
  add column if not exists apollo_qualification_threshold integer not null default 7,

  -- Mindest-Jahresumsatz pro Segment in EUR. Apollo liefert annual_revenue
  -- gelegentlich nicht; in dem Fall wird "unbekannt" beim LLM uebergeben
  -- und das LLM entscheidet anhand anderer Signale (employee_count, industry).
  add column if not exists apollo_min_revenue_eur_enterprise bigint not null default 50000000,
  add column if not exists apollo_min_revenue_eur_smb bigint not null default 5000000,

  -- Industries-Blacklist (z.B. Marketing/Werbung/Recruiting/Consulting/Software).
  -- Wird sowohl als hard-block als auch als LLM-Hinweis genutzt.
  add column if not exists apollo_blacklist_industries text[] not null
    default array[
      'staffing and recruiting',
      'marketing and advertising',
      'advertising services',
      'public relations and communications',
      'management consulting',
      'human resources services',
      'computer software',
      'information technology and services',
      'internet',
      'venture capital and private equity'
    ]::text[],

  -- Echtheits-Check: muss Domain-MX existieren? (DNS-Lookup pro Lead)
  add column if not exists apollo_require_domain_mx boolean not null default true,

  -- Echtheits-Check: nur Apollo-Status="verified" akzeptieren (sonst auch
  -- "likely_to_engage" zulassen).
  add column if not exists apollo_require_email_verified boolean not null default true;

comment on column public.leadmaschine_settings.apollo_qualification_enabled is
  'Master-Switch fuer LLM-basierte ICP-Vorqualifikation. Wenn false, laeuft nur der hard-coded Echtheits-Check.';
comment on column public.leadmaschine_settings.apollo_qualification_threshold is
  'Mindest-Score (1-10) den ein Lead vom LLM bekommen muss, um insertet zu werden. Default 7.';
comment on column public.leadmaschine_settings.apollo_min_revenue_eur_enterprise is
  'Mindest-Jahresumsatz fuer Enterprise-Leads in EUR. Apollo liefert annual_revenue oft nicht; LLM bewertet dann anhand employee_count + industry.';
comment on column public.leadmaschine_settings.apollo_min_revenue_eur_smb is
  'Mindest-Jahresumsatz fuer SMB-Leads in EUR.';
comment on column public.leadmaschine_settings.apollo_blacklist_industries is
  'Branchen die NIE qualifizieren (Marketing/Recruiting/Consulting/Software). Hard-Block + LLM-Hinweis.';
comment on column public.leadmaschine_settings.apollo_require_domain_mx is
  'Echtheits-Check: Lead nur insertet wenn Firmen-Domain einen MX-Record hat.';
comment on column public.leadmaschine_settings.apollo_require_email_verified is
  'Echtheits-Check: nur Leads mit Apollo email_status="verified" akzeptieren.';

-- =========================================================================
-- 2) Run-Counter fuer neue Skip-Reasons
-- =========================================================================
alter table public.apollo_discovery_runs
  add column if not exists skipped_authenticity_count integer not null default 0,
  add column if not exists skipped_unqualified_count integer not null default 0,
  add column if not exists qualification_summary jsonb not null default '[]'::jsonb;

comment on column public.apollo_discovery_runs.skipped_authenticity_count is
  'Wieviele Leads den Echtheits-Check (MX/Email-Status/Datenvollstaendigkeit) nicht bestanden haben.';
comment on column public.apollo_discovery_runs.skipped_unqualified_count is
  'Wieviele Leads vom LLM unter dem Threshold bewertet wurden.';
comment on column public.apollo_discovery_runs.qualification_summary is
  'JSON-Array mit den Top-N LLM-Bewertungen (apollo_person_id, score, reason, qualified). Audit + Tuning.';
