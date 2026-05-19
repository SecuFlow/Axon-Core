-- Wenn profiles.company_id wechselt, mandant_id/tenant_id aus companies nachziehen
-- (bisher nur tenant_id-Änderungen im Trigger 20260429210500).

create or replace function public.profiles_sync_mandant_id_from_legacy()
returns trigger
language plpgsql
as $$
declare
  co_tenant uuid;
begin
  if tg_op = 'INSERT' then
    if new.mandant_id is null then
      if new.company_id is not null then
        select c.tenant_id into co_tenant
          from public.companies c
          where c.id = new.company_id
          limit 1;
        if co_tenant is not null then
          new.tenant_id := coalesce(new.tenant_id, co_tenant);
          new.mandant_id := co_tenant;
        elsif new.tenant_id is not null then
          new.mandant_id := new.tenant_id;
        end if;
      elsif new.tenant_id is not null then
        new.mandant_id := new.tenant_id;
      end if;
      if new.mandant_id is null then
        new.mandant_id := gen_random_uuid();
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id and new.company_id is not null then
      select c.tenant_id into co_tenant
        from public.companies c
        where c.id = new.company_id
        limit 1;
      if co_tenant is not null then
        new.tenant_id := co_tenant;
        new.mandant_id := co_tenant;
      end if;
    elsif new.tenant_id is distinct from old.tenant_id
       and new.mandant_id is not distinct from old.mandant_id
       and new.tenant_id is not null then
      new.mandant_id := new.tenant_id;
    end if;
    if new.mandant_id is null then
      new.mandant_id := coalesce(old.mandant_id, new.tenant_id, gen_random_uuid());
    end if;
    return new;
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
