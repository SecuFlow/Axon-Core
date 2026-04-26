create extension if not exists pgcrypto;

create table if not exists public.demo_access_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid null references auth.users(id) on delete set null,
  company_id uuid not null references public.companies(id) on delete cascade,
  demo_slug text not null,
  token text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz null
);

create index if not exists demo_access_links_company_idx
  on public.demo_access_links(company_id, created_at desc);

create index if not exists demo_access_links_token_idx
  on public.demo_access_links(token);

alter table public.demo_access_links enable row level security;

drop policy if exists demo_access_links_admin_all on public.demo_access_links;
create policy demo_access_links_admin_all
on public.demo_access_links
for all
using (public.is_platform_admin())
with check (public.is_platform_admin());
