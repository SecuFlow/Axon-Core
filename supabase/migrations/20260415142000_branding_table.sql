-- Tenant Branding Store
-- Speichert Logo/Farben zentral pro Mandant für Dashboard + Mitarbeiter-App.

create table if not exists public.branding (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  tenant_id uuid not null unique,
  company_id uuid references public.companies (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,

  brand_name text,
  logo_url text,
  primary_color text
);

create index if not exists branding_company_id_idx on public.branding (company_id);
create index if not exists branding_updated_at_idx on public.branding (updated_at desc);

comment on table public.branding is
  'Mandantenweites Branding (Logo/Farbe), konsumiert von Dashboard und Mitarbeiter-App APIs.';

-- Defensive checks
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'branding_primary_color_hex_chk'
  ) then
    alter table public.branding
      add constraint branding_primary_color_hex_chk
      check (
        primary_color is null
        or primary_color ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'
      );
  end if;
end $$;

-- updated_at auto-refresh
create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_branding_set_updated_at on public.branding;
create trigger trg_branding_set_updated_at
before update on public.branding
for each row
execute function public.set_timestamp_updated_at();

alter table public.branding enable row level security;

drop policy if exists "branding_admin_all" on public.branding;
create policy "branding_admin_all"
  on public.branding
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists "branding_manager_select" on public.branding;
create policy "branding_manager_select"
  on public.branding
  for select
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = (
      select c.tenant_id
      from public.companies c
      where c.id = public.current_user_company_id()
      limit 1
    )
  );

drop policy if exists "branding_manager_write" on public.branding;
create policy "branding_manager_write"
  on public.branding
  for all
  to public
  using (
    public.is_company_manager_or_admin()
    and tenant_id = (
      select c.tenant_id
      from public.companies c
      where c.id = public.current_user_company_id()
      limit 1
    )
  )
  with check (
    public.is_company_manager_or_admin()
    and tenant_id = (
      select c.tenant_id
      from public.companies c
      where c.id = public.current_user_company_id()
      limit 1
    )
  );

-- Seed: vorhandenes companies-Branding in neue Tabelle übernehmen.
insert into public.branding (tenant_id, company_id, brand_name, logo_url, primary_color)
select distinct on (c.tenant_id)
  c.tenant_id,
  c.id,
  coalesce(nullif(trim(c.brand_name), ''), nullif(trim(c.name), '')) as brand_name,
  nullif(trim(c.logo_url), '') as logo_url,
  nullif(trim(c.primary_color), '') as primary_color
from public.companies c
where c.tenant_id is not null
  and (
    coalesce(nullif(trim(c.brand_name), ''), nullif(trim(c.name), '')) is not null
    or nullif(trim(c.logo_url), '') is not null
    or nullif(trim(c.primary_color), '') is not null
  )
order by c.tenant_id, c.created_at asc
on conflict (tenant_id) do nothing;

notify pgrst, 'reload schema';
