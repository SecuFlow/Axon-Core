-- Fix: RLS recursion on public.profiles
-- The previous policies referenced public.profiles inside their own USING/WITH CHECK,
-- which triggers "infinite recursion detected in policy for relation \"profiles\"".

-- Helper: company_id of current auth user (runs as definer, avoids recursive policy evaluation)
create or replace function public.current_user_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.company_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1
$$;

-- Helper: admin check without querying profiles in policy
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
    or exists (
      select 1
      from public.companies c
      where c.user_id = auth.uid()
        and lower(coalesce(c.role, '')) = 'admin'
      limit 1
    )
$$;

-- Helper: manager/admin check (for same-company staff management)
create or replace function public.is_company_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_platform_admin()
    or exists (
      select 1
      from public.companies c
      where c.user_id = auth.uid()
        and lower(coalesce(c.role, '')) in ('manager', 'admin')
      limit 1
    )
$$;

-- Drop recursive policies (names as seen in Supabase UI screenshot)
drop policy if exists "Admins verwalten alle Profile" on public.profiles;
drop policy if exists "Admins ändern Rollen" on public.profiles;
drop policy if exists "Manager verwalten eigene Mitarbeiter" on public.profiles;
drop policy if exists "Nutzer sehen eigenes Profil" on public.profiles;

-- Ensure RLS is enabled
alter table public.profiles enable row level security;

-- Basic self access (select own profile)
create policy "Nutzer sehen eigenes Profil"
  on public.profiles
  for select
  to public
  using (id = auth.uid());

-- Company managers/admins may view profiles in their own company (no recursion via definer function)
create policy "Manager sehen eigene Mitarbeiter"
  on public.profiles
  for select
  to public
  using (
    public.is_company_manager_or_admin()
    and company_id = public.current_user_company_id()
  );

-- Admins manage all profiles
create policy "Admins verwalten alle Profile"
  on public.profiles
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Managers/admins may update profiles in their company (e.g. workforce role, location prefs)
create policy "Manager verwalten eigene Mitarbeiter"
  on public.profiles
  for update
  to public
  using (
    public.is_company_manager_or_admin()
    and company_id = public.current_user_company_id()
  )
  with check (
    public.is_company_manager_or_admin()
    and company_id = public.current_user_company_id()
  );

