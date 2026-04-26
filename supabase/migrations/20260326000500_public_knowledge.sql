-- Public knowledge base for AxonCore PublicAI (technical only)
-- Requires pgvector for embedding similarity search.

create extension if not exists vector;

create table if not exists public.public_knowledge (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null,
  content text not null,
  embedding vector(1536),
  is_duplicate boolean not null default false,
  duplicate_of uuid
);

-- Aeltere Remote-Tabellen ohne volles Schema (CREATE TABLE IF NOT EXISTS ueberspringt)
alter table public.public_knowledge add column if not exists created_at timestamptz;
alter table public.public_knowledge add column if not exists category text;
alter table public.public_knowledge add column if not exists content text;
alter table public.public_knowledge add column if not exists embedding vector(1536);
alter table public.public_knowledge add column if not exists is_duplicate boolean;
alter table public.public_knowledge add column if not exists duplicate_of uuid;

update public.public_knowledge set created_at = coalesce(created_at, now()) where created_at is null;
update public.public_knowledge set category = coalesce(category, '') where category is null;
update public.public_knowledge set content = coalesce(content, '') where content is null;
update public.public_knowledge set is_duplicate = coalesce(is_duplicate, false) where is_duplicate is null;

alter table public.public_knowledge alter column created_at set not null;
alter table public.public_knowledge alter column category set not null;
alter table public.public_knowledge alter column content set not null;
alter table public.public_knowledge alter column is_duplicate set not null;

create index if not exists public_knowledge_created_at_idx
  on public.public_knowledge (created_at desc);

create index if not exists public_knowledge_category_created_at_idx
  on public.public_knowledge (category, created_at desc);

-- Vector index for faster similarity search (cosine distance).
create index if not exists public_knowledge_embedding_ivfflat_idx
  on public.public_knowledge using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

alter table public.public_knowledge enable row level security;

-- Public read access (anon/authenticated) for public knowledge.
drop policy if exists "public_knowledge_select_public" on public.public_knowledge;
create policy "public_knowledge_select_public"
  on public.public_knowledge
  for select
  to anon, authenticated
  using (true);

-- Match function for vector similarity search.
-- Bestehende Installationen: Rückgabe-Typ darf nicht per OR REPLACE geändert werden.
do $$
declare
  r record;
begin
  for r in
    select pg_catalog.pg_get_function_identity_arguments(p.oid) as args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'match_public_knowledge'
  loop
    execute format('drop function if exists public.match_public_knowledge(%s) cascade', r.args);
  end loop;
end $$;

create or replace function public.match_public_knowledge(
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  category text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    public.public_knowledge.id,
    public.public_knowledge.category,
    public.public_knowledge.content,
    1 - (public.public_knowledge.embedding <=> query_embedding) as similarity
  from public.public_knowledge
  where public.public_knowledge.embedding is not null
    and 1 - (public.public_knowledge.embedding <=> query_embedding) >= match_threshold
    and public.public_knowledge.is_duplicate = false
  order by public.public_knowledge.embedding <=> query_embedding
  limit match_count;
$$;

