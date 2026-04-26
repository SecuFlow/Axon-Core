-- Leadmaschine Settings: getrennte Budgets pro Segment (Enterprise vs. KMU)

alter table public.leadmaschine_settings
  add column if not exists leads_per_month_enterprise integer not null default 100;

alter table public.leadmaschine_settings
  add column if not exists leads_per_month_smb integer not null default 40;

alter table public.leadmaschine_settings
  add column if not exists max_actions_per_run_enterprise integer not null default 5;

alter table public.leadmaschine_settings
  add column if not exists max_actions_per_run_smb integer not null default 5;

comment on column public.leadmaschine_settings.leads_per_month_enterprise is 'Monatsbudget (30d) für Enterprise.';
comment on column public.leadmaschine_settings.leads_per_month_smb is 'Monatsbudget (30d) für KMU.';
comment on column public.leadmaschine_settings.max_actions_per_run_enterprise is 'Max vorbereitete Aktionen pro Run (Enterprise).';
comment on column public.leadmaschine_settings.max_actions_per_run_smb is 'Max vorbereitete Aktionen pro Run (KMU).';

