-- Enforce single active session per user (app-level).
-- Middleware compares cookie `axon-session-id` with profiles.active_session_id.
alter table public.profiles
  add column if not exists active_session_id text;

create index if not exists profiles_active_session_id_idx
  on public.profiles (active_session_id);

notify pgrst, 'reload schema';

