-- Leadmaschine: Demo-Link-Tracking erweitern
--
-- Bisher gab es nur `opened_at` (timestamp des ersten Öffnens). Für die
-- Admin-UI brauchen wir aber:
--   - `view_count`        — wie oft wurde der Link gesamt geöffnet (ohne Admin-Klicks)
--   - `last_viewed_at`    — letzter echter (Nicht-Admin-)Aufruf
--   - `last_view_app`     — letzte gesehene App-Variante ("konzern" oder "worker")
--
-- Admin-Klicks (eingeloggter Plattform-Admin) erhöhen den Counter NICHT — die
-- Filterung passiert im Resolver `/api/public/demo-link/[token]`, nicht in der DB.

alter table public.lead_demo_links
  add column if not exists view_count integer not null default 0,
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_view_app text;

comment on column public.lead_demo_links.view_count is
  'Anzahl Demo-Aufrufe ohne Admin-Klicks. Admin-Bypass im Resolver.';
comment on column public.lead_demo_links.last_viewed_at is
  'Letzter Demo-Aufruf durch einen Nicht-Admin (in der Regel der Lead).';
comment on column public.lead_demo_links.last_view_app is
  'Letzte gesehene App-Variante: "konzern" oder "worker".';
