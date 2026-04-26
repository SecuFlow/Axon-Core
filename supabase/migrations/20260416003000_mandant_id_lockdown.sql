-- Mandanten-Trennung: mandant_id wird server-/profilbasiert gesetzt und ist schreibgeschützt.

create or replace function public.enforce_mandant_id_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.mandant_id is distinct from old.mandant_id then
      raise exception 'mandant_id ist schreibgeschützt';
    end if;
  end if;
  return new;
end;
$$;

-- AI Cases: mandant_id immer aus profiles.mandant_id (über user_id)
create or replace function public.ai_cases_set_mandant_from_profile()
returns trigger
language plpgsql
as $$
declare
  mid uuid;
begin
  if new.user_id is not null then
    select p.mandant_id into mid
    from public.profiles p
    where p.id = new.user_id
    limit 1;
    if mid is not null then
      new.mandant_id := mid;
      -- Legacy-Felder konsistent halten (best-effort)
      if new.tenant_id is null then new.tenant_id := mid; end if;
      if new.company_id is null then new.company_id := mid; end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ai_cases_set_mandant_from_profile on public.ai_cases;
create trigger trg_ai_cases_set_mandant_from_profile
before insert on public.ai_cases
for each row execute function public.ai_cases_set_mandant_from_profile();

drop trigger if exists trg_ai_cases_mandant_immutable on public.ai_cases;
create trigger trg_ai_cases_mandant_immutable
before update on public.ai_cases
for each row execute function public.enforce_mandant_id_immutable();

drop trigger if exists trg_machines_mandant_immutable on public.machines;
create trigger trg_machines_mandant_immutable
before update on public.machines
for each row execute function public.enforce_mandant_id_immutable();

drop trigger if exists trg_team_members_mandant_immutable on public.team_members;
create trigger trg_team_members_mandant_immutable
before update on public.team_members
for each row execute function public.enforce_mandant_id_immutable();

notify pgrst, 'reload schema';

