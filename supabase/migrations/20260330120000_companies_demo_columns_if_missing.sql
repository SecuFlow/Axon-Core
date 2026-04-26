-- Hosted / ältere DBs: `companies` kann ohne Demo-Spalten existieren.
-- `create table if not exists` in der Baseline-Migration ergänzt keine Spalten nach.
alter table public.companies add column if not exists demo_slug text;
alter table public.companies add column if not exists is_demo_active boolean not null default false;
alter table public.companies add column if not exists show_cta boolean not null default true;

create index if not exists companies_demo_slug_idx on public.companies (demo_slug);

-- PostgREST: Schema-Cache aktualisieren (lokal & Hosted mit pg_notify)
notify pgrst, 'reload schema';
