-- Leadmaschine Settings – non-destruktiv

create table if not exists public.leadmaschine_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Steuerung
  enabled boolean not null default true,
  leads_per_month integer not null default 100,
  max_actions_per_run integer not null default 5
);

comment on table public.leadmaschine_settings is 'Globale Steuerung der Leadmaschine (Admin).';

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

