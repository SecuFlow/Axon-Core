-- Stripe Pricing Config – non-destruktiv, admin-only

create table if not exists public.pricing_config (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Active Stripe price for enterprise subscription checkout
  stripe_price_id text,
  currency text not null default 'eur',
  interval text not null default 'month'
);

comment on table public.pricing_config is 'Aktive Stripe-Preis-Konfiguration (Admin steuerbar).';

create index if not exists pricing_config_updated_idx
  on public.pricing_config (updated_at desc);

alter table public.pricing_config enable row level security;

drop policy if exists "pricing_config_admin_all" on public.pricing_config;
create policy "pricing_config_admin_all"
  on public.pricing_config
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

