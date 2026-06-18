alter type public.quote_status add value if not exists 'generated';
alter type public.quote_status add value if not exists 'negotiating';

create type public.file_parse_job_status as enum (
  'pending',
  'running',
  'success',
  'failed',
  'needs_review'
);

create table public.file_parse_jobs (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.request_files(id) on delete cascade,
  status public.file_parse_job_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  scheduled_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_config_versions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  translation_requirement_id uuid references public.translation_requirements(id) on delete set null,
  version_no integer not null check (version_no > 0),
  config_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, version_no)
);

create table public.request_config_files (
  id uuid primary key default gen_random_uuid(),
  config_version_id uuid not null references public.request_config_versions(id) on delete cascade,
  request_file_id uuid not null references public.request_files(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (config_version_id, request_file_id)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  quantity numeric(12, 2),
  unit text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_factor_snapshots (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references public.quotes(id) on delete cascade,
  factors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_negotiation_messages (
  id uuid primary key default gen_random_uuid(),
  negotiation_id uuid not null references public.quote_negotiations(id) on delete cascade,
  author_id uuid references auth.users(id),
  body text,
  expected_amount numeric(12, 2) check (expected_amount is null or expected_amount >= 0),
  expected_delivery_at timestamptz,
  adjustment_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index file_parse_jobs_file_status_idx on public.file_parse_jobs(file_id, status);
create index request_config_versions_request_idx on public.request_config_versions(request_id, version_no desc);
create index request_config_files_file_idx on public.request_config_files(request_file_id);
create index quote_items_quote_idx on public.quote_items(quote_id);
create index quote_negotiation_messages_negotiation_idx on public.quote_negotiation_messages(negotiation_id, created_at);

create trigger set_file_parse_jobs_updated_at before update on public.file_parse_jobs for each row execute function public.set_updated_at();
create trigger set_request_config_versions_updated_at before update on public.request_config_versions for each row execute function public.set_updated_at();
create trigger set_request_config_files_updated_at before update on public.request_config_files for each row execute function public.set_updated_at();
create trigger set_quote_items_updated_at before update on public.quote_items for each row execute function public.set_updated_at();
create trigger set_quote_factor_snapshots_updated_at before update on public.quote_factor_snapshots for each row execute function public.set_updated_at();
create trigger set_quote_negotiation_messages_updated_at before update on public.quote_negotiation_messages for each row execute function public.set_updated_at();

alter table public.file_parse_jobs enable row level security;
alter table public.request_config_versions enable row level security;
alter table public.request_config_files enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_factor_snapshots enable row level security;
alter table public.quote_negotiation_messages enable row level security;

grant select, insert, update, delete on public.file_parse_jobs to authenticated;
grant select, insert, update, delete on public.request_config_versions to authenticated;
grant select, insert, update, delete on public.request_config_files to authenticated;
grant select, insert, update, delete on public.quote_items to authenticated;
grant select, insert, update, delete on public.quote_factor_snapshots to authenticated;
grant select, insert, update, delete on public.quote_negotiation_messages to authenticated;

create policy "Authenticated users can create customer organizations"
on public.organizations
for insert
with check (auth.uid() is not null and type = 'customer');

create policy "Users can create own requester membership"
on public.organization_members
for insert
with check (auth.uid() = user_id and role = 'requester');

create policy "Request participants can create quotes"
on public.quotes
for insert
with check (public.can_access_request(request_id));

create policy "Requesters can create own pending orders"
on public.orders
for insert
with check (
  requester_id = auth.uid()
  and status = 'pending_confirmation'
  and public.can_access_request(request_id)
);

create policy "Parse jobs follow file access"
on public.file_parse_jobs
for all
using (
  exists (
    select 1
    from public.request_files file
    where file.id = file_id
      and public.can_access_request(file.request_id)
  )
)
with check (
  exists (
    select 1
    from public.request_files file
    where file.id = file_id
      and public.can_access_request(file.request_id)
  )
);

create policy "Config versions follow request access"
on public.request_config_versions
for all
using (public.can_access_request(request_id))
with check (public.can_access_request(request_id));

create policy "Config files follow config access"
on public.request_config_files
for all
using (
  exists (
    select 1
    from public.request_config_versions config
    where config.id = config_version_id
      and public.can_access_request(config.request_id)
  )
)
with check (
  exists (
    select 1
    from public.request_config_versions config
    where config.id = config_version_id
      and public.can_access_request(config.request_id)
  )
);

create policy "Quote items follow quote access"
on public.quote_items
for all
using (
  exists (
    select 1
    from public.quotes quote
    where quote.id = quote_id
      and public.can_access_request(quote.request_id)
  )
)
with check (
  exists (
    select 1
    from public.quotes quote
    where quote.id = quote_id
      and public.can_access_request(quote.request_id)
  )
);

create policy "Quote factors follow quote access"
on public.quote_factor_snapshots
for all
using (
  exists (
    select 1
    from public.quotes quote
    where quote.id = quote_id
      and public.can_access_request(quote.request_id)
  )
)
with check (
  exists (
    select 1
    from public.quotes quote
    where quote.id = quote_id
      and public.can_access_request(quote.request_id)
  )
);

create policy "Negotiation messages follow negotiation access"
on public.quote_negotiation_messages
for all
using (
  exists (
    select 1
    from public.quote_negotiations negotiation
    where negotiation.id = negotiation_id
      and public.can_access_request(negotiation.request_id)
  )
)
with check (
  exists (
    select 1
    from public.quote_negotiations negotiation
    where negotiation.id = negotiation_id
      and public.can_access_request(negotiation.request_id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-files',
  'request-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/xml',
    'text/xml',
    'text/plain'
  ]
)
on conflict (id) do nothing;

create policy "Request file owners can upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Request file participants can read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.request_files file
      where file.storage_bucket = bucket_id
        and file.storage_path = name
        and public.can_access_request(file.request_id)
    )
  )
);

create policy "Request file participants can update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'request-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.request_files file
      where file.storage_bucket = bucket_id
        and file.storage_path = name
        and public.can_access_request(file.request_id)
    )
  )
)
with check (
  bucket_id = 'request-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
