-- Public read for Website team section

alter table public.team_members enable row level security;

drop policy if exists "team_members_public_read" on public.team_members;
create policy "team_members_public_read"
  on public.team_members
  for select
  to public
  using (true);

