-- Leadmaschine: individueller Demo-Link pro Lead (Token → Redirect + Tracking)

create table if not exists public.lead_demo_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  token text not null,
  opened_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists lead_demo_links_token_uq on public.lead_demo_links (token);
create index if not exists lead_demo_links_lead_created_idx on public.lead_demo_links (lead_id, created_at desc);

comment on table public.lead_demo_links is 'Öffentliche Demo-Links für Leads (tokenisiert).';

alter table public.lead_demo_links enable row level security;

drop policy if exists "lead_demo_links_admin_all" on public.lead_demo_links;
create policy "lead_demo_links_admin_all"
  on public.lead_demo_links
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

