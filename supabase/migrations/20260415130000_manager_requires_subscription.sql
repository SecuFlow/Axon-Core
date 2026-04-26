-- Enforce: companies.role = manager => companies.is_subscribed = true
-- Diese Regel wird auf DB-Ebene garantiert (Insert + Update).

-- Legacy-Daten reparieren: bestehende Manager ohne aktives Abo korrigieren.
update public.companies
set is_subscribed = true
where lower(coalesce(role, '')) = 'manager'
  and coalesce(is_subscribed, false) = false;

create or replace function public.enforce_manager_subscription()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.role, '')) = 'manager' then
    new.is_subscribed := true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_manager_subscription on public.companies;
create trigger trg_enforce_manager_subscription
before insert or update on public.companies
for each row
execute function public.enforce_manager_subscription();

-- Optional defense-in-depth: CHECK verhindert ungueltige Endzustaende.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_manager_requires_subscription_chk'
  ) then
    alter table public.companies
      add constraint companies_manager_requires_subscription_chk
      check (
        lower(coalesce(role, '')) <> 'manager'
        or coalesce(is_subscribed, false) = true
      );
  end if;
end $$;

notify pgrst, 'reload schema';
