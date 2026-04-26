-- Referenz-Schema (nur wenn noch nicht vorhanden). Bereits ausgeführte DB: überspringen oder anpassen.

create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  balance_axn numeric(18, 4) not null default 0,
  updated_at timestamptz not null default now(),
  constraint wallets_user_id_key unique (user_id)
);

create index if not exists wallets_user_id_idx on public.wallets (user_id);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid references public.wallets (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  amount_axn numeric(18, 4) not null,
  type text,
  created_at timestamptz not null default now()
);

-- Aeltere transactions ohne user_id / weitere Spalten (CREATE TABLE IF NOT EXISTS greift nicht)
alter table public.transactions add column if not exists wallet_id uuid;
alter table public.transactions add column if not exists user_id uuid;
alter table public.transactions add column if not exists amount_axn numeric(18, 4);
alter table public.transactions add column if not exists type text;
alter table public.transactions add column if not exists created_at timestamptz;

update public.transactions set amount_axn = coalesce(amount_axn, 0) where amount_axn is null;
update public.transactions set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.transactions alter column amount_axn set not null;
alter table public.transactions alter column created_at set not null;

create index if not exists transactions_user_id_created_idx
  on public.transactions (user_id, created_at desc);

create index if not exists transactions_wallet_id_created_idx
  on public.transactions (wallet_id, created_at desc);

alter table public.wallets enable row level security;
alter table public.transactions enable row level security;

-- Zugriff über Service Role (API) wie bei ai_cases
