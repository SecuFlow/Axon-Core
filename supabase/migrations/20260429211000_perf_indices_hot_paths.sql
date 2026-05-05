-- Performance-Indizes für die Hot-Path-Reads im Backend.
--
-- Auswahl basiert auf Code-Analyse:
--   • applyMandantFilter benutzt durchgängig mandant_id in Order/Where.
--   • /api/wartung/cases sortiert nach (created_at desc) mit mandant_id-Filter.
--   • /api/wartung/machines & machine_logs filtern auf machine_id IN (...) mit Sort.
--   • /api/dashboard/team selektiert alle profiles ohne Filter — daher Composite-Index
--     auf (mandant_id, role) für die fast immer mit-laufende Mandant+Role-Auswertung.
--   • audit_logs liest Reports nach tenant_id mit created_at desc.
--
-- Alle Indizes sind als IF NOT EXISTS angelegt; Postgres ignoriert Bestehendes.
-- Wir nutzen bewusst KEIN CONCURRENTLY (geht in Transactional Migrations nicht);
-- für eine Live-DB mit laufenden Schreibvorgängen kann der DBA die Indizes
-- vorher manuell mit CONCURRENTLY anlegen — die Migration springt dann via
-- IF NOT EXISTS sauber drüber.

-- ai_cases: Hauptlist-Query "letzte N Tage je Mandant".
create index if not exists ai_cases_mandant_created_idx
  on public.ai_cases (mandant_id, created_at desc);

-- machines: Mandanten-Filter mit Sort nach Name.
create index if not exists machines_mandant_name_idx
  on public.machines (mandant_id, name);

-- machine_logs: hängende List-Query in /api/wartung/machines.
create index if not exists machine_logs_machine_created_idx2
  on public.machine_logs (machine_id, created_at desc);

-- team_members: Public-Filter & Mandanten-Filter.
create index if not exists team_members_mandant_sort_idx
  on public.team_members (mandant_id, sort_order asc, created_at desc);

-- audit_logs: Mandanten-Reports nach Datum.
create index if not exists audit_logs_tenant_created_idx
  on public.audit_logs (tenant_id, created_at desc);

-- profiles: bei Manager-Listen wird häufig per company_id gefiltert.
create index if not exists profiles_company_role_idx
  on public.profiles (company_id, role)
  where company_id is not null;

-- companies: Lookup nach user_id (Admin-Listen, Worker-Bootstrap).
create index if not exists companies_user_id_role_idx
  on public.companies (user_id)
  where user_id is not null;

notify pgrst, 'reload schema';
