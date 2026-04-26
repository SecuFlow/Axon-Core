-- Profil pro Auth-User: Mandant und optional bevorzugter Standort.
alter table public.profiles
  add column if not exists company_id uuid;

alter table public.profiles
  add column if not exists default_location_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_default_location_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_default_location_id_fkey
      foreign key (default_location_id) references public.locations (id)
      on delete set null;
  end if;
end $$;

create index if not exists profiles_company_id_idx on public.profiles (company_id);
