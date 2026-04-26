-- Persistierter KI-Statusbericht pro Maschine (Dashboard).
alter table public.machines
  add column if not exists last_ai_report text,
  add column if not exists last_ai_report_at timestamptz;

comment on column public.machines.last_ai_report is
  'Letzter KI-Statusbericht (persistiert).';

comment on column public.machines.last_ai_report_at is
  'Zeitpunkt der letzten KI-Bericht-Generierung.';

-- Falls fruehere Migration ai_summary/ai_summary_at angelegt hat: einmalig uebernehmen.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'machines'
      and column_name = 'ai_summary'
  ) then
    update public.machines
    set
      last_ai_report = coalesce(last_ai_report, ai_summary),
      last_ai_report_at = coalesce(last_ai_report_at, ai_summary_at)
    where last_ai_report is null
      and ai_summary is not null;
  end if;
end $$;
