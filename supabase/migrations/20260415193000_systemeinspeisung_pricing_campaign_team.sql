-- Systemeinspeisung: Paketpreise, Kampagnenbanner, Team-Freigabe

alter table if exists public.pricing_config
  add column if not exists stripe_price_id_enterprise text,
  add column if not exists stripe_price_id_smb text;

update public.pricing_config
set stripe_price_id_enterprise = coalesce(nullif(trim(stripe_price_id_enterprise), ''), nullif(trim(stripe_price_id), ''))
where coalesce(trim(stripe_price_id_enterprise), '') = ''
  and coalesce(trim(stripe_price_id), '') <> '';

alter table if exists public.marketing_campaign_settings
  add column if not exists banner_image_url text;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id uuid,
  name text not null default 'Unbekannt',
  role text not null default 'Team',
  email text,
  phone text,
  photo_url text,
  sort_order integer not null default 100
);

alter table if exists public.team_members
  add column if not exists is_public boolean not null default true;
