-- Leadmaschine: Segment A (Enterprise) vs Segment B (Kleinunternehmer / KMU)

alter table public.leads
  add column if not exists lead_segment text not null default 'enterprise';

comment on column public.leads.lead_segment is 'lead_segment: enterprise | smb — steuert Qualifikation, Copy und ggf. Sequenz-Timing.';

-- Bestehende Zeilen: einheitlich Enterprise; Dedupe-Key um Präfix ergänzen (Kollisionen mit neuem smb:-Pfad vermeiden)
update public.leads
set dedupe_key = 'enterprise:' || dedupe_key
where lead_segment = 'enterprise'
  and dedupe_key is not null
  and dedupe_key not like 'enterprise:%'
  and dedupe_key not like 'smb:%';

create index if not exists leads_lead_segment_idx on public.leads (lead_segment);
