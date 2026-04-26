-- Leadmaschine: Deep-Research Notes (manuell/AI) pro Lead

create table if not exists public.lead_research_notes (
  lead_id uuid primary key references public.leads (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  summary text, -- 2-5 Sätze: Wer ist es, worum geht's?
  pain_points text, -- Stichpunkte / kurze Absätze
  personalization_hooks text, -- konkrete Hooks für Outreach (Produkte, Initiativen, News, Projekte)
  sources jsonb not null default '[]'::jsonb, -- Liste (URLs/Titel/Notizen)
  confidence smallint not null default 50, -- 0..100
  raw_notes text
);

comment on table public.lead_research_notes is 'Deep-Research Notes pro Lead (für personalisierte Outreach-Copy).';

alter table public.lead_research_notes enable row level security;

drop policy if exists "lead_research_notes_admin_all" on public.lead_research_notes;
create policy "lead_research_notes_admin_all"
  on public.lead_research_notes
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create index if not exists lead_research_notes_updated_idx
  on public.lead_research_notes (updated_at desc);

