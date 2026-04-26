-- Axon-Sekretär: persistente Sequence Drafts mit Freigabe

create table if not exists public.lead_sequence_drafts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null, -- mail_1 | follow_up | demo
  subject text not null,
  body text not null,

  status text not null default 'draft', -- draft | approved | pushed
  approved_at timestamptz,
  approved_by uuid,
  pushed_at timestamptz,
  pushed_by uuid,

  metadata jsonb not null default '{}'::jsonb,

  constraint lead_sequence_drafts_kind_check check (kind in ('mail_1','follow_up','demo')),
  constraint lead_sequence_drafts_status_check check (status in ('draft','approved','pushed'))
);

create index if not exists lead_sequence_drafts_lead_id_created_idx
  on public.lead_sequence_drafts (lead_id, created_at desc);

create index if not exists lead_sequence_drafts_status_created_idx
  on public.lead_sequence_drafts (status, created_at desc);

comment on table public.lead_sequence_drafts is 'Axon-Sekretär: Entwürfe für Leadmaschine-Outreach, mit Freigabe-Workflow.';

alter table public.lead_sequence_drafts enable row level security;

drop policy if exists "lead_sequence_drafts_admin_all" on public.lead_sequence_drafts;
create policy "lead_sequence_drafts_admin_all"
  on public.lead_sequence_drafts
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

