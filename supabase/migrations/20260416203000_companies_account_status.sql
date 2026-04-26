alter table public.companies
  add column if not exists account_status text not null default 'pending';

update public.companies
set account_status = case when is_subscribed = true then 'active' else 'pending' end
where account_status is null
   or account_status not in ('pending', 'active');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'companies_account_status_check'
  ) then
    alter table public.companies
      add constraint companies_account_status_check
      check (account_status in ('pending', 'active'));
  end if;
end $$;

create index if not exists companies_account_status_idx
  on public.companies (account_status);

notify pgrst, 'reload schema';

