create type public.filing_signature_request_status as enum (
  'draft',
  'sent',
  'completed',
  'cancelled'
);

create type public.filing_signature_file_direction as enum (
  'pm_to_requester',
  'requester_to_pm'
);

create type public.filing_signature_email_status as enum (
  'not_sent',
  'pending',
  'sent',
  'failed'
);

create table public.filing_signature_requests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  recipient_id uuid not null references auth.users(id),
  recipient_name text,
  recipient_email text,
  status public.filing_signature_request_status not null default 'draft',
  pm_note text,
  due_at date,
  sent_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  email_status public.filing_signature_email_status not null default 'not_sent',
  email_provider_id text,
  email_last_error text,
  email_sent_at timestamptz,
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sent' or sent_at is not null),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);

create table public.filing_signature_files (
  id uuid primary key default gen_random_uuid(),
  signature_request_id uuid not null references public.filing_signature_requests(id) on delete cascade,
  direction public.filing_signature_file_direction not null,
  storage_bucket text not null default 'filing-signature-files',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 52428800),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (storage_bucket, storage_path),
  check (mime_type in (
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'application/zip',
    'application/x-zip-compressed'
  ))
);

create unique index filing_signature_requests_one_active_idx
on public.filing_signature_requests(request_id)
where status in ('draft', 'sent');

create index filing_signature_requests_request_created_idx
on public.filing_signature_requests(request_id, created_at desc);

create index filing_signature_requests_recipient_status_idx
on public.filing_signature_requests(recipient_id, status, due_at);

create index filing_signature_files_request_direction_idx
on public.filing_signature_files(signature_request_id, direction, created_at);

create trigger set_filing_signature_requests_updated_at
before update on public.filing_signature_requests
for each row execute function public.set_updated_at();

create or replace function public.enforce_filing_signature_file_limits()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_count integer;
  existing_bytes bigint;
begin
  perform 1
  from public.filing_signature_requests
  where id = new.signature_request_id
  for update;

  select count(*), coalesce(sum(file_size), 0)
  into existing_count, existing_bytes
  from public.filing_signature_files
  where signature_request_id = new.signature_request_id
    and direction = new.direction;

  if existing_count >= 10 then
    raise exception 'A signature package can contain at most 10 files.';
  end if;

  if existing_bytes + new.file_size > 104857600 then
    raise exception 'The combined signature package must not exceed 100 MB.';
  end if;

  return new;
end;
$$;

create trigger enforce_filing_signature_file_limits
before insert on public.filing_signature_files
for each row execute function public.enforce_filing_signature_file_limits();

revoke all on function public.enforce_filing_signature_file_limits() from public;

alter table public.filing_signature_requests enable row level security;
alter table public.filing_signature_files enable row level security;

grant select, insert, update, delete on table public.filing_signature_requests to authenticated;
grant select, insert, delete on table public.filing_signature_files to authenticated;
grant select, insert, update, delete on table public.filing_signature_requests to service_role;
grant select, insert, update, delete on table public.filing_signature_files to service_role;

create policy "Signature requests are visible to recipient and staff"
on public.filing_signature_requests
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  or public.is_platform_staff()
);

create policy "Signature requests can be created by staff"
on public.filing_signature_requests
for insert
to authenticated
with check (
  public.is_platform_staff()
  and created_by = (select auth.uid())
  and exists (
    select 1
    from public.translation_requests request
    where request.id = request_id
      and request.requester_id = recipient_id
  )
);

create policy "Signature requests can be updated by staff"
on public.filing_signature_requests
for update
to authenticated
using (public.is_platform_staff())
with check (public.is_platform_staff());

create policy "Draft signature requests can be deleted by staff"
on public.filing_signature_requests
for delete
to authenticated
using (public.is_platform_staff() and status = 'draft');

create policy "Signature files are visible to recipient and staff"
on public.filing_signature_files
for select
to authenticated
using (
  exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        signature_request.recipient_id = (select auth.uid())
        or public.is_platform_staff()
      )
  )
);

create policy "Signature files can be uploaded by participants"
on public.filing_signature_files
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and public.is_platform_staff()
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
        )
      )
  )
);

create policy "Signature files can be removed before submission"
on public.filing_signature_files
for delete
to authenticated
using (
  exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and public.is_platform_staff()
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
          and uploaded_by = (select auth.uid())
        )
      )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'filing-signature-files',
  'filing-signature-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Signature participants can upload storage objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'filing-signature-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Signature participants can read storage objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'filing-signature-files'
  and exists (
    select 1
    from public.filing_signature_files file
    join public.filing_signature_requests signature_request
      on signature_request.id = file.signature_request_id
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and (
        signature_request.recipient_id = (select auth.uid())
        or public.is_platform_staff()
      )
  )
);

create policy "Signature participants can remove storage objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'filing-signature-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.filing_signature_files file
    join public.filing_signature_requests signature_request
      on signature_request.id = file.signature_request_id
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and (
        (
          file.direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and public.is_platform_staff()
        )
        or (
          file.direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
        )
      )
  )
);

create or replace function public.send_filing_signature_request(
  target_signature_request_id uuid
)
returns public.filing_signature_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  signature_request public.filing_signature_requests;
  request_row public.translation_requests;
  source_file_count integer;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM or operations staff can send signature documents.';
  end if;

  select *
  into signature_request
  from public.filing_signature_requests
  where id = target_signature_request_id
  for update;

  if not found then
    raise exception 'Signature request not found.';
  end if;

  if signature_request.status <> 'draft' then
    raise exception 'Only a draft signature request can be sent.';
  end if;

  select *
  into request_row
  from public.translation_requests
  where id = signature_request.request_id;

  if request_row.pm_status <> 'in_progress' then
    raise exception 'Signature documents can only be sent while the request is In progress.';
  end if;

  if not exists (
    select 1
    from public.translation_requirements requirement
    where requirement.request_id = signature_request.request_id
      and 'filing' = any(requirement.service_types)
  ) then
    raise exception 'Signature documents are only available for Filing services.';
  end if;

  if nullif(trim(signature_request.recipient_email), '') is null then
    raise exception 'The requester email address is missing.';
  end if;

  select count(*)
  into source_file_count
  from public.filing_signature_files
  where signature_request_id = signature_request.id
    and direction = 'pm_to_requester';

  if source_file_count < 1 then
    raise exception 'Upload at least one document before sending.';
  end if;

  update public.filing_signature_requests
  set status = 'sent',
      sent_at = now(),
      email_status = 'pending',
      email_last_error = null
  where id = signature_request.id
  returning * into signature_request;

  insert into public.notifications (
    recipient_id,
    type,
    entity_type,
    entity_id,
    payload
  ) values (
    signature_request.recipient_id,
    'filing_signature_required',
    'filing_signature_request',
    signature_request.id,
    jsonb_build_object(
      'requestId', signature_request.request_id,
      'fileCount', source_file_count,
      'dueAt', signature_request.due_at
    )
  );

  insert into public.request_events (
    request_id,
    actor_id,
    event_type,
    from_status,
    to_status,
    payload
  ) values (
    signature_request.request_id,
    (select auth.uid()),
    'filing.signature.sent.pm',
    request_row.workflow_stage::text,
    request_row.workflow_stage::text,
    jsonb_build_object(
      'signatureRequestId', signature_request.id,
      'fileCount', source_file_count,
      'dueAt', signature_request.due_at
    )
  );

  return signature_request;
end;
$$;

revoke all on function public.send_filing_signature_request(uuid) from public;
grant execute on function public.send_filing_signature_request(uuid) to authenticated;
