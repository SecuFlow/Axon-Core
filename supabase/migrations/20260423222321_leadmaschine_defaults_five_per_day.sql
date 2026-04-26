-- Leadmaschine Defaults: 5 neue Kontakte/Tag pro Segment (UWG-konformer Cap).
-- Der Tages-Cap zählt nach neuer Runner-Semantik nur noch mail_1_sent.
-- Bestehende Zeilen werden auf 5/5 angepasst, Follow-Ups/Demos laufen ungedeckelt
-- (bis auf den globalen max_actions_per_run-Anti-Burst).

update public.leadmaschine_settings
set
  leads_per_day_enterprise = 5,
  leads_per_day_smb = 5,
  updated_at = now();

-- Falls noch keine Zeile existiert: Standardkonfiguration mit 5/5 anlegen.
insert into public.leadmaschine_settings
  (enabled, leads_per_month, max_actions_per_run,
   leads_per_month_enterprise, leads_per_month_smb,
   max_actions_per_run_enterprise, max_actions_per_run_smb,
   leads_per_day_enterprise, leads_per_day_smb,
   min_seconds_between_gmail_sends)
select true, 150, 10, 150, 150, 10, 10, 5, 5, 120
where not exists (select 1 from public.leadmaschine_settings);

comment on column public.leadmaschine_settings.leads_per_day_enterprise is
  'Max. NEUE Erstkontakte pro Kalendertag (Enterprise) - zählt nur mail_1_sent, rollierend 24h. Follow-Ups/Demos unbegrenzt (nur max_actions_per_run_* deckelt).';
comment on column public.leadmaschine_settings.leads_per_day_smb is
  'Max. NEUE Erstkontakte pro Kalendertag (KMU) - zählt nur mail_1_sent, rollierend 24h. Follow-Ups/Demos unbegrenzt (nur max_actions_per_run_* deckelt).';
