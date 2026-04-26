-- Axon-Sekretär (Admin-only): Daily Briefings & Monitoring

create table if not exists public.admin_briefings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null default 'Daily Briefing',
  content text not null,
  metadata jsonb not null default '{}'::jsonb
);

comment on table public.admin_briefings is 'Admin Daily Briefings (Axon-Sekretär).';

alter table public.admin_briefings enable row level security;

drop policy if exists "admin_briefings_admin_all" on public.admin_briefings;
create policy "admin_briefings_admin_all"
  on public.admin_briefings
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

