-- Adds photo URLs array for Wartungsdashboard lightbox.
-- Keep this migration minimal to avoid introducing other columns unintentionally.

alter table public.ai_cases
  add column if not exists photo_urls jsonb not null default '[]'::jsonb;

