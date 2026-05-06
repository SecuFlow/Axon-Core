-- =========================================================================
-- Fix: RLS auf public.locations einschalten + Policies sauber re-definieren
-- =========================================================================
-- Hintergrund:
-- Die Tabelle wurde in 20260329000000_locations.sql ohne `enable row level
-- security` angelegt. Spaeter wurden 4 Policies per Studio-UI angelegt
-- (deutsche Namen). Da RLS auf der Tabelle aber nie aktiviert wurde, sind
-- die Policies wirkungslos und Supabase Advisors meldet die Tabelle als
-- oeffentlich beschreibbar (rls_disabled_in_public, "Critical issue").
--
-- Fix:
--   1) Alte Studio-Policies entfernen (idempotent, falls Namen abweichen).
--   2) RLS hart einschalten.
--   3) Policies per SQL neu anlegen, die den vorhandenen Helpern
--      (current_user_company_id / is_company_manager_or_admin /
--      is_platform_admin aus 20260329160000_fix_profiles_rls_recursion.sql)
--      vertrauen statt direkt public.profiles abzufragen
--      (kein Recursion-Risiko, kein UI-Drift mehr).
--
-- Idempotent.

-- =========================================================================
-- 1) Bestehende UI-Policies entfernen
-- =========================================================================
drop policy if exists "Admins dürfen Standorte löschen" on public.locations;
drop policy if exists "Admins/Manager löschen Standorte" on public.locations;
drop policy if exists "Manager dürfen Standorte anlegen" on public.locations;
drop policy if exists "Manager sehen eigene Standorte" on public.locations;

-- Falls jemand die Policies bereits via Migration neu angelegt hat
-- (Re-Run-Schutz):
drop policy if exists "locations_select_company"        on public.locations;
drop policy if exists "locations_insert_manager_admin"  on public.locations;
drop policy if exists "locations_update_manager_admin"  on public.locations;
drop policy if exists "locations_delete_manager_admin"  on public.locations;
drop policy if exists "locations_admin_all"             on public.locations;

-- =========================================================================
-- 2) RLS hart einschalten
-- =========================================================================
alter table public.locations enable row level security;

-- =========================================================================
-- 3) Policies neu definieren
-- =========================================================================

-- SELECT: jeder User der zur Firma gehoert sieht deren Standorte.
-- Entspricht semantisch der alten Policy "Manager sehen eigene Standorte",
-- erweitert aber bewusst auf alle Mitglieder der company_id (= Mandant),
-- damit Worker im UI ihre Werke aussuchen koennen.
create policy "locations_select_company"
  on public.locations
  for select
  to public
  using (
    public.is_platform_admin()
    or company_id = public.current_user_company_id()
  );

-- INSERT: Manager + Admin der eigenen Firma duerfen Standorte anlegen.
-- (Alt: nur 'manager'. Wir lassen Admin bewusst zu, weil Plattform-Admins
-- ohnehin via is_platform_admin() durchgehen.)
create policy "locations_insert_manager_admin"
  on public.locations
  for insert
  to public
  with check (
    public.is_platform_admin()
    or (
      public.is_company_manager_or_admin()
      and company_id = public.current_user_company_id()
    )
  );

-- UPDATE: gleiche Berechtigung wie Insert. (Vorher gab es keinen Update-
-- Pfad in den UI-Policies; das war eine Luecke — Manager konnten Standorte
-- nicht umbenennen ohne Service-Role.)
create policy "locations_update_manager_admin"
  on public.locations
  for update
  to public
  using (
    public.is_platform_admin()
    or (
      public.is_company_manager_or_admin()
      and company_id = public.current_user_company_id()
    )
  )
  with check (
    public.is_platform_admin()
    or (
      public.is_company_manager_or_admin()
      and company_id = public.current_user_company_id()
    )
  );

-- DELETE: Manager + Admin der eigenen Firma. Entspricht der staerkeren der
-- beiden alten Policies ("Admins/Manager löschen Standorte").
create policy "locations_delete_manager_admin"
  on public.locations
  for delete
  to public
  using (
    public.is_platform_admin()
    or (
      public.is_company_manager_or_admin()
      and company_id = public.current_user_company_id()
    )
  );

comment on table public.locations is
  'Werke/Standorte; company_id entspricht machines.company_id (Mandant). RLS aktiv seit 2026-05-06: SELECT pro company_id, INSERT/UPDATE/DELETE nur Manager/Admin der Firma + Plattform-Admin.';
