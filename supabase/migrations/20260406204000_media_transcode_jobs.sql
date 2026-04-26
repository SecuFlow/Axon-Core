-- Media Pipeline: Video-Transcoding Jobs (web-optimierte Ausgabe)

create table if not exists public.media_transcode_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  site_content_id uuid not null references public.site_content (id) on delete cascade,
  bucket text not null,
  object_path text not null,

  status text not null default 'pending', -- pending | running | done | failed | skipped
  attempts integer not null default 0,
  last_error text,
  output_urls jsonb not null default '{}'::jsonb
);

create index if not exists media_transcode_jobs_status_updated_idx
  on public.media_transcode_jobs (status, updated_at desc);

create unique index if not exists media_transcode_jobs_site_content_uq
  on public.media_transcode_jobs (site_content_id);

comment on table public.media_transcode_jobs is 'Transcoding-Queue für System-Einspeisung Videos.';

alter table public.media_transcode_jobs enable row level security;

drop policy if exists "media_transcode_jobs_admin_all" on public.media_transcode_jobs;
create policy "media_transcode_jobs_admin_all"
  on public.media_transcode_jobs
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

