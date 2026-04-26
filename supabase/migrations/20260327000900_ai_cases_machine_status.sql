alter table public.ai_cases
  add column if not exists machine_status text;

comment on column public.ai_cases.machine_status is
  'Betriebszustand laut Spracheingabe: active, maintenance, offline';
