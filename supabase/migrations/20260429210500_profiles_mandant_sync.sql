-- profiles.mandant_id Defense-in-Depth.
--
-- Bisherige Lage: Migration 20260415213000 setzt mandant_id für profiles auf
-- NOT NULL und backfillt einmalig — pflegt sie aber bei späteren Inserts/Updates
-- nicht automatisch. Anders als für ai_cases/machines/team_members existierte
-- für profiles bisher KEIN sync_mandant_id-Trigger.
--
-- Folge: jeder Code-Pfad, der nur tenant_id/company_id schreibt (Manager legt
-- Mitarbeiter an, Admin zieht Profil um, etc.), riskierte einen NOT-NULL-Verstoß
-- oder eine inkonsistente mandant_id.
--
-- Diese Migration ergänzt den fehlenden Trigger als zweite Verteidigungslinie.
-- Der Application-Code setzt mandant_id zwar inzwischen explizit (Bug-Fix #1
-- und #2), aber der Trigger schützt vor zukünftigen Regressionen.

create or replace function public.profiles_sync_mandant_id_from_legacy()
returns trigger
language plpgsql
as $$
begin
  -- Bei Insert: mandant_id aus tenant_id/company_id ableiten, falls leer.
  -- Achtung: profiles.company_id ist FK auf companies.id (PK) und KEINE
  -- Mandanten-UUID. Daher muss bei diesem Fallback erst über companies aufgelöst
  -- werden — wenn das nicht möglich ist, lieber tenant_id nehmen, sonst neue UUID.
  if tg_op = 'INSERT' then
    if new.mandant_id is null then
      if new.tenant_id is not null then
        new.mandant_id := new.tenant_id;
      elsif new.company_id is not null then
        select c.tenant_id
          into new.mandant_id
          from public.companies c
          where c.id = new.company_id
          limit 1;
      end if;
      if new.mandant_id is null then
        new.mandant_id := gen_random_uuid();
      end if;
    end if;
    return new;
  end if;

  -- Bei Update: wenn tenant_id explizit auf einen neuen Wert gesetzt wird,
  -- mandant_id automatisch nachziehen — außer der Aufrufer hat selbst auch
  -- mandant_id gesetzt (dann gewinnt der explizite Wert).
  if tg_op = 'UPDATE' then
    if new.tenant_id is distinct from old.tenant_id
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

drop trigger if exists trg_profiles_sync_mandant_id on public.profiles;
create trigger trg_profiles_sync_mandant_id
before insert or update on public.profiles
for each row execute function public.profiles_sync_mandant_id_from_legacy();

comment on function public.profiles_sync_mandant_id_from_legacy() is
  'Hält profiles.mandant_id konsistent mit tenant_id/company_id. Verhindert NOT-NULL-Verstöße bei Mitarbeiter-Anlage und stille Mandanten-Drift bei Profil-Updates.';

notify pgrst, 'reload schema';
