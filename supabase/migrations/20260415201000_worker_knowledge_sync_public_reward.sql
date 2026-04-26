-- Worker Knowledge Sync: Manager-Freigabe + Reward-Gutschrift

alter table if exists public.ai_cases
  add column if not exists manager_public_approved boolean not null default false,
  add column if not exists manager_public_approved_at timestamptz,
  add column if not exists worker_public_shared_at timestamptz,
  add column if not exists worker_rewarded_at timestamptz;
