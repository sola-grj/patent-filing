do $$
begin
  create type public.patent_ocr_cache_scope as enum ('global', 'organization');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_ocr_cache_status as enum (
    'processing',
    'completed',
    'failed'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.patent_ocr_cache_lifecycle as enum (
    'temporary',
    'permanent'
  );
exception
  when duplicate_object then null;
end $$;

create table public.patent_ocr_results (
  id uuid primary key default gen_random_uuid(),
  scope_type public.patent_ocr_cache_scope not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  source text,
  normalized_number text,
  original_filename text not null,
  file_type text not null,
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  analysis_input_sha256 text not null check (analysis_input_sha256 ~ '^[0-9a-f]{64}$'),
  pipeline_fingerprint text not null check (pipeline_fingerprint ~ '^[0-9a-f]{64}$'),
  status public.patent_ocr_cache_status not null default 'processing',
  lifecycle public.patent_ocr_cache_lifecycle not null default 'temporary',
  result_storage_bucket text,
  result_storage_path text,
  result_sha256 text check (result_sha256 is null or result_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint check (byte_size is null or byte_size >= 0),
  summary jsonb not null default '{}'::jsonb,
  lease_until timestamptz,
  retry_after timestamptz,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patent_ocr_results_scope_check check (
    (scope_type = 'global' and organization_id is null)
    or (scope_type = 'organization' and organization_id is not null)
  ),
  constraint patent_ocr_results_completed_location_check check (
    status <> 'completed'
    or (
      result_storage_bucket is not null
      and result_storage_path is not null
      and result_sha256 is not null
      and byte_size is not null
    )
  ),
  constraint patent_ocr_results_lifecycle_check check (
    (lifecycle = 'temporary' and expires_at is not null)
    or (lifecycle = 'permanent' and expires_at is null)
  )
);

create unique index patent_ocr_results_global_key
  on public.patent_ocr_results(analysis_input_sha256, pipeline_fingerprint)
  where scope_type = 'global';

create unique index patent_ocr_results_organization_key
  on public.patent_ocr_results(
    organization_id,
    analysis_input_sha256,
    pipeline_fingerprint
  )
  where scope_type = 'organization';

create unique index patent_ocr_results_storage_path_key
  on public.patent_ocr_results(result_storage_path)
  where result_storage_path is not null;

create index patent_ocr_results_cleanup_idx
  on public.patent_ocr_results(lifecycle, expires_at, last_accessed_at);

create index patent_ocr_results_processing_idx
  on public.patent_ocr_results(status, lease_until, retry_after)
  where status in ('processing', 'failed');

create table public.patent_ocr_result_links (
  id uuid primary key default gen_random_uuid(),
  ocr_result_id uuid not null
    references public.patent_ocr_results(id) on delete cascade,
  request_id uuid not null
    references public.translation_requests(id) on delete cascade,
  request_file_id uuid
    references public.request_files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index patent_ocr_result_links_file_key
  on public.patent_ocr_result_links(ocr_result_id, request_id, request_file_id)
  where request_file_id is not null;

create unique index patent_ocr_result_links_request_key
  on public.patent_ocr_result_links(ocr_result_id, request_id)
  where request_file_id is null;

create index patent_ocr_result_links_request_idx
  on public.patent_ocr_result_links(request_id);

create index patent_ocr_result_links_request_file_idx
  on public.patent_ocr_result_links(request_file_id)
  where request_file_id is not null;

create table public.patent_ocr_page_results (
  id uuid primary key default gen_random_uuid(),
  scope_type public.patent_ocr_cache_scope not null,
  organization_id uuid references public.organizations(id) on delete cascade,
  page_image_sha256 text not null check (page_image_sha256 ~ '^[0-9a-f]{64}$'),
  ocr_fingerprint text not null check (ocr_fingerprint ~ '^[0-9a-f]{64}$'),
  status public.patent_ocr_cache_status not null default 'processing',
  lifecycle public.patent_ocr_cache_lifecycle not null default 'temporary',
  result jsonb not null default '{}'::jsonb,
  lease_until timestamptz,
  retry_after timestamptz,
  expires_at timestamptz,
  last_accessed_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patent_ocr_page_results_scope_check check (
    (scope_type = 'global' and organization_id is null)
    or (scope_type = 'organization' and organization_id is not null)
  ),
  constraint patent_ocr_page_results_lifecycle_check check (
    (lifecycle = 'temporary' and expires_at is not null)
    or (lifecycle = 'permanent' and expires_at is null)
  )
);

create unique index patent_ocr_page_results_global_key
  on public.patent_ocr_page_results(page_image_sha256, ocr_fingerprint)
  where scope_type = 'global';

create unique index patent_ocr_page_results_organization_key
  on public.patent_ocr_page_results(
    organization_id,
    page_image_sha256,
    ocr_fingerprint
  )
  where scope_type = 'organization';

create index patent_ocr_page_results_cleanup_idx
  on public.patent_ocr_page_results(lifecycle, expires_at, last_accessed_at);

create table public.patent_ocr_result_pages (
  id uuid primary key default gen_random_uuid(),
  ocr_result_id uuid not null
    references public.patent_ocr_results(id) on delete cascade,
  page_result_id uuid not null
    references public.patent_ocr_page_results(id) on delete restrict,
  page_number integer check (page_number is null or page_number > 0),
  source_reference text,
  section_name text,
  created_at timestamptz not null default now(),
  unique (ocr_result_id, page_result_id, page_number, source_reference)
);

alter table public.request_files
  add column if not exists content_sha256 text
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

create index request_files_content_sha256_idx
  on public.request_files(content_sha256)
  where content_sha256 is not null;

create trigger set_patent_ocr_results_updated_at
before update on public.patent_ocr_results
for each row execute function public.set_updated_at();

create trigger set_patent_ocr_page_results_updated_at
before update on public.patent_ocr_page_results
for each row execute function public.set_updated_at();

alter table public.patent_ocr_results enable row level security;
alter table public.patent_ocr_result_links enable row level security;
alter table public.patent_ocr_page_results enable row level security;
alter table public.patent_ocr_result_pages enable row level security;

alter table public.patent_ocr_results force row level security;
alter table public.patent_ocr_result_links force row level security;
alter table public.patent_ocr_page_results force row level security;
alter table public.patent_ocr_result_pages force row level security;

revoke all on public.patent_ocr_results from anon, authenticated;
revoke all on public.patent_ocr_result_links from anon, authenticated;
revoke all on public.patent_ocr_page_results from anon, authenticated;
revoke all on public.patent_ocr_result_pages from anon, authenticated;

grant select, insert, update, delete on public.patent_ocr_results to service_role;
grant select, insert, update, delete on public.patent_ocr_result_links to service_role;
grant select, insert, update, delete on public.patent_ocr_page_results to service_role;
grant select, insert, update, delete on public.patent_ocr_result_pages to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'patent-ocr-results',
  'patent-ocr-results',
  false,
  52428800,
  array['application/gzip', 'application/json', 'application/octet-stream']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
