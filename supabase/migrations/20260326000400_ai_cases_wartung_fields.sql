alter table public.ai_cases
  add column if not exists machine_name text,
  add column if not exists required_part text,
  add column if not exists photo_urls jsonb not null default '[]'::jsonb,
  add column if not exists thumbs_feedback int,
  add column if not exists share_with_public boolean not null default false;

