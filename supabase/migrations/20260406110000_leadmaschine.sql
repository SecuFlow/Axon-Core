-- Leadmaschine (Enterprise Akquise) – non-destruktive Erweiterung
-- Tabellen: leads, lead_outreach_events, lead_messages

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Dedupe / Identität
  dedupe_key text not null,
  company_name text not null,
  domain text,

  -- Qualifizierung
  market_segment text,
  industry text,
  employee_count integer,
  revenue_eur bigint,
  hq_location text,

  -- Status / Flow
  stage text not null default 'new', -- new | mail_1 | follow_up | demo_sent | replied | disqualified
  next_action_at timestamptz,
  last_contacted_at timestamptz,
  owner text, -- optional: Verantwortlicher im Team (Name/Rolle)
  notes text
);

create unique index if not exists leads_dedupe_key_uq on public.leads (dedupe_key);
create index if not exists leads_stage_idx on public.leads (stage);
create index if not exists leads_next_action_idx on public.leads (next_action_at);

comment on table public.leads is 'Leadmaschine: Enterprise-Leads mit Deduplizierung und Sequenz-Status.';

create table if not exists public.lead_outreach_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id) on delete cascade,

  event_type text not null, -- mail_1_sent | follow_up_sent | demo_sent | reply_detected | manual_note | disqualified
  channel text not null default 'email',
  status text not null default 'ok',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists lead_outreach_events_lead_id_created_idx
  on public.lead_outreach_events (lead_id, created_at desc);

comment on table public.lead_outreach_events is 'Zeitlinie aller Sequenz-Ereignisse pro Lead (auditierbar).';

create table if not exists public.lead_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id) on delete cascade,

  message_type text not null, -- mail_1 | follow_up | demo
  subject text,
  body text not null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists lead_messages_lead_id_created_idx
  on public.lead_messages (lead_id, created_at desc);

comment on table public.lead_messages is 'Versand-Content pro Lead (vollständige Transparenz).';

-- RLS: ausschließlich Plattform-Admins (über Security Definer helpers).
alter table public.leads enable row level security;
alter table public.lead_outreach_events enable row level security;
alter table public.lead_messages enable row level security;

drop policy if exists "leads_admin_all" on public.leads;
create policy "leads_admin_all"
  on public.leads
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "lead_outreach_events_admin_all" on public.lead_outreach_events;
create policy "lead_outreach_events_admin_all"
  on public.lead_outreach_events
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "lead_messages_admin_all" on public.lead_messages;
create policy "lead_messages_admin_all"
  on public.lead_messages
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

