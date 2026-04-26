create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  -- Von der KI gewählte Priorität (Original)
  original_priority text not null,
  -- Von Mitarbeiter ggf. ueberschriebene Priorität (inkl. Originalwert)
  priority_override jsonb not null,
  -- Feedbacktext durch Mitarbeiter
  feedback_text text,
  -- Analyseergebnis (zur Anzeige/Referenz)
  analysis_text text,
  -- Loesungsschritte der KI
  solution_steps jsonb
);

-- Bestehende Remote-Tabellen (ohne user_id o. a.) auf aktuelles Schema bringen
alter table public.ai_feedback add column if not exists user_id uuid;
alter table public.ai_feedback add column if not exists original_priority text;
alter table public.ai_feedback add column if not exists priority_override jsonb;
alter table public.ai_feedback add column if not exists feedback_text text;
alter table public.ai_feedback add column if not exists analysis_text text;
alter table public.ai_feedback add column if not exists solution_steps jsonb;

update public.ai_feedback
set original_priority = coalesce(original_priority, '')
where original_priority is null;

update public.ai_feedback
set priority_override = coalesce(priority_override, '{}'::jsonb)
where priority_override is null;

update public.ai_feedback
set user_id = gen_random_uuid()
where user_id is null;

alter table public.ai_feedback alter column user_id set not null;
alter table public.ai_feedback alter column original_priority set not null;
alter table public.ai_feedback alter column priority_override set not null;

create index if not exists ai_feedback_user_id_created_at_idx
  on public.ai_feedback (user_id, created_at desc);

alter table public.ai_feedback enable row level security;

