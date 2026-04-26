-- MANUELL im SQL-Editor oder mit psql ausführen (nicht als Auto-Migration).
-- Vorher Backup. Löscht Firmen inkl. Maschinen/Logs; siehe Kommentare.

begin;

create temporary table _cleanup_company_ids (id uuid primary key) on commit drop;

-- 1) Firmen verknüpft mit eliasstadler988@gmail.com (Owner oder Profil)
insert into _cleanup_company_ids (id)
select distinct c.id
from public.companies c
where c.user_id in (
  select u.id from auth.users u where u.email = 'eliasstadler988@gmail.com'
)
union
select distinct p.company_id
from public.profiles p
join auth.users u on u.id = p.id
where u.email = 'eliasstadler988@gmail.com'
  and p.company_id is not null
on conflict do nothing;

-- 2) Siemens-Duplikate: eine behalten (mit Logo bevorzugt, sonst jüngstes created_at)
with siemens as (
  select c.id, c.created_at,
    (c.logo_url is not null and trim(c.logo_url) <> '') as has_logo
  from public.companies c
  where lower(coalesce(c.name, '')) like '%siemens%'
     or lower(coalesce(c.brand_name, '')) like '%siemens%'
     or lower(coalesce(c.demo_slug, '')) like '%siemens%'
),
keeper_siemens as (
  select s.id from siemens s
  order by s.has_logo desc, s.created_at desc
  limit 1
)
insert into _cleanup_company_ids (id)
select s.id from siemens s
where s.id not in (select id from keeper_siemens)
on conflict do nothing;

-- 3) Apple-Duplikate (gleiche Logik)
with apple as (
  select c.id, c.created_at,
    (c.logo_url is not null and trim(c.logo_url) <> '') as has_logo
  from public.companies c
  where lower(coalesce(c.name, '')) like '%apple%'
     or lower(coalesce(c.brand_name, '')) like '%apple%'
     or lower(coalesce(c.demo_slug, '')) like '%apple%'
),
keeper_apple as (
  select a.id from apple a
  order by a.has_logo desc, a.created_at desc
  limit 1
)
insert into _cleanup_company_ids (id)
select a.id from apple a
where a.id not in (select id from keeper_apple)
on conflict do nothing;

-- 4) Weder Logo noch Primärfarbe
insert into _cleanup_company_ids (id)
select c.id from public.companies c
where (c.logo_url is null or trim(c.logo_url) = '')
  and (c.primary_color is null or trim(c.primary_color) = '')
on conflict do nothing;

delete from public.machine_logs ml
using public.machines m
where ml.machine_id = m.id
  and m.company_id in (select id from _cleanup_company_ids);

delete from public.machines
where company_id in (select id from _cleanup_company_ids);

delete from public.locations
where company_id in (select id from _cleanup_company_ids);

update public.profiles
set company_id = null
where company_id in (select id from _cleanup_company_ids);

update public.ai_cases
set company_id = null, machine_id = null
where company_id in (select id from _cleanup_company_ids);

delete from public.audit_logs
where company_id in (select id from _cleanup_company_ids);

delete from public.companies
where id in (select id from _cleanup_company_ids);

commit;
