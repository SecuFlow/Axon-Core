create table if not exists public.ai_cases (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null,
  analysis_text text,
  solution_steps jsonb,
  original_priority text not null,
  priority_override jsonb not null
);

create index if not exists ai_cases_user_id_created_at_idx
  on public.ai_cases (user_id, created_at desc);

alter table public.ai_cases enable row level security;

