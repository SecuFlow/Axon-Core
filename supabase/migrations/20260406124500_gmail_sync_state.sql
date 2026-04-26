-- Gmail inbound sync state (history cursor) – non-destruktiv

create table if not exists public.gmail_sync_state (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email_address text not null,
  last_history_id bigint
);

create unique index if not exists gmail_sync_state_email_uq
  on public.gmail_sync_state (email_address);

alter table public.gmail_sync_state enable row level security;

drop policy if exists "gmail_sync_state_admin_all" on public.gmail_sync_state;
create policy "gmail_sync_state_admin_all"
  on public.gmail_sync_state
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

