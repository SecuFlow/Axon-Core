-- Saisonale Marketing-Layer – non-destruktiv

create table if not exists public.marketing_campaign_settings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  enabled boolean not null default false,
  title text,
  subtitle text,
  cta_label text,
  cta_href text
);

comment on table public.marketing_campaign_settings is 'Saisonale Kampagnen (Website Banner/CTA), Admin steuerbar.';

create index if not exists marketing_campaign_settings_updated_idx
  on public.marketing_campaign_settings (updated_at desc);

alter table public.marketing_campaign_settings enable row level security;

drop policy if exists "marketing_campaign_settings_admin_all" on public.marketing_campaign_settings;
create policy "marketing_campaign_settings_admin_all"
  on public.marketing_campaign_settings
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

