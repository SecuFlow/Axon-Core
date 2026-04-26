alter table if exists public.profiles
  add column if not exists must_change_password boolean not null default false;

alter table if exists public.profiles
  add column if not exists password_changed_at timestamptz;

-- Bestehende Mitarbeiter werden einmalig zum Passwortwechsel gezwungen.
update public.profiles
set must_change_password = true
where coalesce(lower(trim(role)), '') in ('worker', 'user', 'mitarbeiter', 'employee')
  and coalesce(must_change_password, false) = false
  and password_changed_at is null;

create or replace function public.sync_worker_password_policy()
returns trigger
language plpgsql
as $$
declare
  role_norm text := coalesce(lower(trim(new.role)), '');
begin
  if role_norm in ('worker', 'user', 'mitarbeiter', 'employee') then
    if new.password_changed_at is null then
      new.must_change_password := true;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_worker_password_policy on public.profiles;
create trigger trg_profiles_worker_password_policy
before insert or update on public.profiles
for each row execute function public.sync_worker_password_policy();
