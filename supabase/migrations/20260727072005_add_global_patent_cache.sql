do $$
begin
  create type public.patent_record_status as enum ('active', 'inactive', 'superseded');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_refresh_status as enum ('idle', 'fetching', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_document_status as enum ('available', 'failed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_cache_status as enum (
    'hit_fresh',
    'hit_stale_refreshing',
    'miss_fetched',
    'stale_fallback'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_lookup_outcome as enum (
    'success',
    'not_found',
    'error',
    'backfill'
  );
exception
  when duplicate_object then null;
end $$;

create table public.patents (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('epo', 'wipo')),
  normalized_number text not null,
  display_number text not null,
  jurisdiction text not null,
  kind_code text,
  application_no text,
  publication_no text,
  title text,
  publication_date date,
  metadata_snapshot jsonb not null default '{}'::jsonb,
  raw_source_refs jsonb not null default '{}'::jsonb,
  record_status public.patent_record_status not null default 'active',
  superseded_by uuid references public.patents(id) on delete restrict,
  last_successful_fetch_at timestamptz,
  refresh_due_at timestamptz,
  force_refresh_at timestamptz,
  last_refresh_attempt_at timestamptz,
  last_refresh_error text,
  refresh_status public.patent_refresh_status not null default 'idle',
  refresh_lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, normalized_number),
  check (
    refresh_due_at is null
    or force_refresh_at is null
    or force_refresh_at >= refresh_due_at
  ),
  check (superseded_by is null or superseded_by <> id)
);

create table public.patent_lookup_aliases (
  id uuid primary key default gen_random_uuid(),
  patent_id uuid not null references public.patents(id) on delete restrict,
  alias_number text not null,
  normalized_alias text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patent_documents (
  id uuid primary key default gen_random_uuid(),
  patent_id uuid not null references public.patents(id) on delete restrict,
  document_type text not null default 'original_publication',
  version_label text,
  kind_code text,
  original_filename text not null,
  mime_type text not null,
  byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_bucket text not null default 'patent-originals',
  storage_path text not null unique,
  upstream_source_url text,
  status public.patent_document_status not null default 'available',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patent_id, document_type, sha256)
);

create table public.patent_lookup_events (
  id uuid primary key default gen_random_uuid(),
  patent_id uuid references public.patents(id) on delete set null,
  document_id uuid references public.patent_documents(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  request_id uuid references public.translation_requests(id) on delete set null,
  trace_id text not null,
  query text not null,
  normalized_number text,
  source text check (source is null or source in ('epo', 'wipo')),
  cache_status public.patent_cache_status,
  outcome public.patent_lookup_outcome not null,
  elapsed_ms integer not null check (elapsed_ms >= 0),
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.request_patents
  add column if not exists patent_id uuid
    references public.patents(id) on delete set null;

alter table public.request_files
  add column if not exists patent_document_id uuid
    references public.patent_documents(id) on delete set null;

alter table public.patent_file_versions
  add column if not exists patent_document_id uuid
    references public.patent_documents(id) on delete set null;

create index patents_superseded_by_idx on public.patents(superseded_by);
create index patents_refresh_due_idx
  on public.patents(record_status, refresh_due_at)
  where record_status = 'active';
create index patent_lookup_aliases_patent_id_idx
  on public.patent_lookup_aliases(patent_id);
create index patent_documents_patent_id_idx
  on public.patent_documents(patent_id);
create index patent_documents_sha256_idx
  on public.patent_documents(sha256);
create index patent_lookup_events_patent_created_idx
  on public.patent_lookup_events(patent_id, created_at desc);
create index patent_lookup_events_user_created_idx
  on public.patent_lookup_events(user_id, created_at desc);
create index patent_lookup_events_organization_created_idx
  on public.patent_lookup_events(organization_id, created_at desc);
create index patent_lookup_events_request_id_idx
  on public.patent_lookup_events(request_id);
create index request_patents_patent_id_idx
  on public.request_patents(patent_id);
create index request_files_patent_document_id_idx
  on public.request_files(patent_document_id);
create index patent_file_versions_patent_document_id_idx
  on public.patent_file_versions(patent_document_id);

create trigger set_patents_updated_at
before update on public.patents
for each row execute function public.set_updated_at();

create trigger set_patent_lookup_aliases_updated_at
before update on public.patent_lookup_aliases
for each row execute function public.set_updated_at();

create trigger set_patent_documents_updated_at
before update on public.patent_documents
for each row execute function public.set_updated_at();

alter table public.patents enable row level security;
alter table public.patent_lookup_aliases enable row level security;
alter table public.patent_documents enable row level security;
alter table public.patent_lookup_events enable row level security;

alter table public.patents force row level security;
alter table public.patent_lookup_aliases force row level security;
alter table public.patent_documents force row level security;
alter table public.patent_lookup_events force row level security;

revoke all on public.patents from anon, authenticated;
revoke all on public.patent_lookup_aliases from anon, authenticated;
revoke all on public.patent_documents from anon, authenticated;
revoke all on public.patent_lookup_events from anon, authenticated;

grant select, insert, update, delete on public.patents to service_role;
grant select, insert, update, delete on public.patent_lookup_aliases to service_role;
grant select, insert, update, delete on public.patent_documents to service_role;
grant select, insert, update, delete on public.patent_lookup_events to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'patent-originals',
  'patent-originals',
  false,
  104857600,
  array['application/pdf', 'application/zip', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
