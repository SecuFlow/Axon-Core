-- Allow admins/managers to read/update their own company branding without brittle joins.
-- Uses SECURITY DEFINER helpers from 20260329160000_fix_profiles_rls_recursion.sql:
--  - public.is_platform_admin()
--  - public.is_company_manager_or_admin()
--  - public.current_user_company_id()

alter table public.companies enable row level security;

drop policy if exists "companies_select_own_or_admin" on public.companies;
create policy "companies_select_own_or_admin"
  on public.companies
  for select
  to public
  using (
    public.is_platform_admin()
    or id = public.current_user_company_id()
  );

drop policy if exists "companies_update_branding_own_or_admin" on public.companies;
create policy "companies_update_branding_own_or_admin"
  on public.companies
  for update
  to public
  using (
    public.is_platform_admin()
    or (public.is_company_manager_or_admin() and id = public.current_user_company_id())
  )
  with check (
    public.is_platform_admin()
    or (public.is_company_manager_or_admin() and id = public.current_user_company_id())
  );

