-- Leadmaschine LinkedIn Ecosystem (Matrix-Riss + Prospects + KI Social Center)
-- Additive, idempotente Migration. Keine Breaking Changes.
--
-- Spec:
-- 1) leadmaschine_targets   : vom Admin gepflegte Branchen/Staedte fuer den Matrix-Riss-Generator.
-- 2) linkedin_prospects     : LinkedIn-Profile aus Google-Dork-Suche, Status prospect/connected/promoted/skipped.
-- 3) content_pool           : KI-generierte Posts (2x/Woche) + Kommentar-Entwuerfe pro Prospect.
-- 4) leadmaschine_settings  : optionaler Doku-Flag lead_daily_cap_locked.
--
-- RLS: nur Plattform-Admins (via public.is_platform_admin()).

-- =========================================================================
-- 1) leadmaschine_targets
-- =========================================================================
create table if not exists public.leadmaschine_targets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  industry text not null,
  city text not null,
  is_active boolean not null default true,
  last_used_at timestamptz,
  notes text
);

-- Dedupliziere identische Kombis (case-insensitive).
create unique index if not exists leadmaschine_targets_dedup_uq
  on public.leadmaschine_targets (lower(industry), lower(city));

create index if not exists leadmaschine_targets_active_idx
  on public.leadmaschine_targets (is_active, last_used_at);

comment on table public.leadmaschine_targets is
  'Branchen/Staedte-Pool fuer den Matrix-Riss-Generator (Google-Dork-Suche nach LinkedIn-Profilen).';
comment on column public.leadmaschine_targets.last_used_at is
  'Zeitstempel der letzten Auswahl durch den Matrix-Riss-Generator (Round-Robin-Priorisierung).';

alter table public.leadmaschine_targets enable row level security;

drop policy if exists "leadmaschine_targets_admin_all" on public.leadmaschine_targets;
create policy "leadmaschine_targets_admin_all"
  on public.leadmaschine_targets
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- =========================================================================
-- 2) linkedin_prospects
-- =========================================================================
create table if not exists public.linkedin_prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  target_id uuid references public.leadmaschine_targets (id) on delete set null,
  industry text,
  city text,

  corporate_group_name text,
  location_name text,
  manager_name text not null,
  linkedin_url text not null,
  department text,
  notes text,

  -- prospect | connected | promoted | skipped
  status text not null default 'prospect',

  domain text,
  generated_email text,
  generated_email_patterns jsonb not null default '[]'::jsonb,

  promoted_lead_id uuid references public.leads (id) on delete set null,

  connected_at timestamptz,
  promoted_at timestamptz,
  skipped_at timestamptz
);

-- Dedupe: ein LinkedIn-Profil darf nur einmal aktiv in der Pipeline stehen.
create unique index if not exists linkedin_prospects_url_uq
  on public.linkedin_prospects (lower(linkedin_url));

create index if not exists linkedin_prospects_status_idx
  on public.linkedin_prospects (status, created_at desc);

create index if not exists linkedin_prospects_target_idx
  on public.linkedin_prospects (target_id);

comment on table public.linkedin_prospects is
  'LinkedIn-Profile aus Google-Dork-Suche (Matrix-Riss). Uebergang: prospect -> connected -> promoted (-> leads).';
comment on column public.linkedin_prospects.status is
  'Lifecycle: prospect (gefunden) | connected (manuell vernetzt) | promoted (in Email-Leadmaschine uebernommen) | skipped.';
comment on column public.linkedin_prospects.generated_email_patterns is
  'Array aller generierten Email-Pattern-Vorschlaege (vorname.nachname@, v.nachname@, ...). generated_email = primaere Wahl.';

alter table public.linkedin_prospects enable row level security;

drop policy if exists "linkedin_prospects_admin_all" on public.linkedin_prospects;
create policy "linkedin_prospects_admin_all"
  on public.linkedin_prospects
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- =========================================================================
-- 3) content_pool (KI-generierte Posts + Kommentar-Entwuerfe)
-- =========================================================================
create table if not exists public.content_pool (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- post | comment
  type text not null,

  target_prospect_id uuid references public.linkedin_prospects (id) on delete set null,
  -- Original-Post-Text (nur fuer Kommentare): vom Admin per Copy-Paste eingefuegt.
  source_post_text text,

  text_draft text not null,
  model text,

  is_posted boolean not null default false,
  scheduled_for timestamptz,
  posted_at timestamptz,

  metadata jsonb not null default '{}'::jsonb
);

create index if not exists content_pool_type_posted_idx
  on public.content_pool (type, is_posted, created_at desc);

create index if not exists content_pool_target_prospect_idx
  on public.content_pool (target_prospect_id)
  where target_prospect_id is not null;

comment on table public.content_pool is
  'KI Social Center: generierte LinkedIn-Posts (2x/Woche) und Kommentar-Entwuerfe pro Prospect. Admin veroeffentlicht manuell.';
comment on column public.content_pool.source_post_text is
  'Bei type=comment: der vom Admin eingefuegte Original-Post-Text des Managers (Basis fuer KI-Kommentar).';

alter table public.content_pool enable row level security;

drop policy if exists "content_pool_admin_all" on public.content_pool;
create policy "content_pool_admin_all"
  on public.content_pool
  for all
  to public
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- =========================================================================
-- 4) leadmaschine_settings: Doku-Flag fuer Hard-Cap 5/Tag
-- =========================================================================
alter table public.leadmaschine_settings
  add column if not exists lead_daily_cap_locked boolean not null default true;

comment on column public.leadmaschine_settings.lead_daily_cap_locked is
  'Doku-Flag: Tages-Cap 5 neue Erstkontakte ist im Code als Konstante (LEAD_DAILY_HARD_CAP) hart fixiert (DSGVO/UWG).';

-- Stelle sicher, dass bestehende Settings-Zeilen den fixen Tages-Cap 5 tragen.
update public.leadmaschine_settings
set
  leads_per_day_enterprise = 5,
  leads_per_day_smb = 5,
  lead_daily_cap_locked = true,
  updated_at = now();
