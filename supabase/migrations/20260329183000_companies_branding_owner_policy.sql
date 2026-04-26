-- Allow company owners (companies.user_id = auth.uid()) to read/update their own branding.
-- This fixes cases where profiles.company_id is still NULL (e.g. fresh enterprise signup),
-- which previously blocked LogoUploader updates with "0 rows updated".

alter table public.companies enable row level security;

-- SELECT: own company by either profiles.company_id or ownership (user_id)
drop policy if exists "companies_select_own_or_admin" on public.companies;
create policy "companies_select_own_or_admin"
  on public.companies
  for select
  to public
  using (
    public.is_platform_admin()
    or id = public.current_user_company_id()
    or user_id = auth.uid()
  );

-- UPDATE branding: platform admin, managers/admins for their company, or owner row
drop policy if exists "companies_update_branding_own_or_admin" on public.companies;
create policy "companies_update_branding_own_or_admin"
  on public.companies
  for update
  to public
  using (
    public.is_platform_admin()
    or user_id = auth.uid()
    or (public.is_company_manager_or_admin() and id = public.current_user_company_id())
  )
  with check (
    public.is_platform_admin()
    or user_id = auth.uid()
    or (public.is_company_manager_or_admin() and id = public.current_user_company_id())
  );

