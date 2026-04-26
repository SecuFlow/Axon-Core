-- AXN-Guthaben pro Nutzer (v. a. Privatpersonen ohne companies-Zeile)
create table if not exists public.user_axn_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_axn numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists user_axn_balances_balance_idx
  on public.user_axn_balances (balance_axn desc);

alter table public.user_axn_balances enable row level security;

-- Lesen/Schreiben erfolgt über Service Role in den API-Routen
