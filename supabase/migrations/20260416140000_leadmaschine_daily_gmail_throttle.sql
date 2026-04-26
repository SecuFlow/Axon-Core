-- Leadmaschine: Tages-Lead-Rate, Gmail-Throttle, idempotente Tabellen-/Spaltensicherung

create table if not exists public.leadmaschine_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  enabled boolean not null default true,
  leads_per_month integer not null default 100,
  max_actions_per_run integer not null default 5,
  leads_per_month_enterprise integer not null default 100,
  leads_per_month_smb integer not null default 40,
  max_actions_per_run_enterprise integer not null default 5,
  max_actions_per_run_smb integer not null default 5
);

alter table public.leadmaschine_settings
  add column if not exists leads_per_day_enterprise integer not null default 4;

alter table public.leadmaschine_settings
  add column if not exists leads_per_day_smb integer not null default 2;

alter table public.leadmaschine_settings
  add column if not exists min_seconds_between_gmail_sends integer not null default 120;

comment on column public.leadmaschine_settings.leads_per_day_enterprise is 'Max. vorbereitete Outreach-Aktionen pro Kalendertag (Enterprise), rollierend 24h.';
comment on column public.leadmaschine_settings.leads_per_day_smb is 'Max. vorbereitete Outreach-Aktionen pro Kalendertag (KMU), rollierend 24h.';
comment on column public.leadmaschine_settings.min_seconds_between_gmail_sends is 'Mindestabstand zwischen manuellen Gmail-Versänden (Spam-Schutz).';

-- Einmalig: Tages-Rate aus bestehenden Monatswerten ableiten (~30 Tage)
update public.leadmaschine_settings
set
  leads_per_day_enterprise = greatest(
    1,
    least(500, round(leads_per_month_enterprise::numeric / 30)::int)
  ),
  leads_per_day_smb = greatest(
    1,
    least(500, round(leads_per_month_smb::numeric / 30)::int)
  );

create index if not exists leadmaschine_settings_updated_idx
  on public.leadmaschine_settings (updated_at desc);

alter table public.leadmaschine_settings enable row level security;

drop policy if exists "leadmaschine_settings_admin_all" on public.leadmaschine_settings;
create policy "leadmaschine_settings_admin_all"
  on public.leadmaschine_settings
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
