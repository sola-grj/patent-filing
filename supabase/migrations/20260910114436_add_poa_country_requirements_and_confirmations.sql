create type public.ep_poa_requirement as enum (
  'original',
  'scanned_copy',
  'not_required'
);

alter table public.ep_countries
  add column poa_requirement public.ep_poa_requirement
  not null default 'not_required';

comment on column public.ep_countries.poa_requirement is
  'POA document requirement from EPV standard rates 2026-08-18. Original and scanned-copy countries participate in the country POA workflow.';

update public.ep_countries
set poa_requirement = 'original'
where id in (133, 156, 182);

update public.ep_countries
set poa_requirement = 'scanned_copy'
where id in (
  26, 41, 68, 93, 138, 139, 146, 147, 148, 149, 150, 153,
  159, 160, 162, 164, 165, 166, 171, 183, 189, 201
);

create table public.filing_signature_country_confirmations (
  id uuid primary key default extensions.gen_random_uuid(),
  signature_request_id uuid not null
    references public.filing_signature_requests(id) on delete cascade,
  ep_country_id integer not null
    references public.ep_countries(id) on update restrict on delete restrict,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (signature_request_id, ep_country_id)
);

create index filing_signature_country_confirmations_request_idx
on public.filing_signature_country_confirmations(signature_request_id, confirmed_at);

alter table public.filing_signature_country_confirmations enable row level security;
revoke all on table public.filing_signature_country_confirmations
from public, anon, authenticated;
grant select on table public.filing_signature_country_confirmations to authenticated;
grant select, insert, update, delete on table public.filing_signature_country_confirmations to service_role;

create policy "Signature country confirmations follow request read access"
on public.filing_signature_country_confirmations for select to authenticated
using (
  exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and private.can_read_request(signature_request.request_id)
  )
);

drop policy if exists "Signature participants can upload files"
on public.filing_signature_files;

create policy "Signature participants can upload files"
on public.filing_signature_files for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status in ('draft', 'sent')
          and private.is_supplier_staff_for_request(signature_request.request_id)
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
          and not exists (
            select 1
            from public.filing_signature_country_confirmations confirmation
            where confirmation.signature_request_id = signature_request.id
              and confirmation.ep_country_id = filing_signature_files.ep_country_id
          )
        )
      )
      and (
        exists (
          select 1
          from public.translation_requirements requirement
          join public.ep_countries country
            on country.id = filing_signature_files.ep_country_id
           and country.poa_requirement <> 'not_required'
          where requirement.request_id = signature_request.request_id
            and requirement.ep_service_type_code in (
              'traditional_validation',
              'traditional_validation_unitary_patent'
            )
            and filing_signature_files.ep_country_id = any(requirement.ep_country_ids)
        )
        or (
          direction = 'requester_to_pm'
          and filing_signature_files.ep_country_id is null
          and private.has_legacy_filing_signature_source(signature_request.id)
        )
        or (
          filing_signature_files.ep_country_id is null
          and not exists (
            select 1
            from public.translation_requirements requirement
            where requirement.request_id = signature_request.request_id
              and requirement.ep_service_type_code in (
                'traditional_validation',
                'traditional_validation_unitary_patent'
              )
          )
        )
      )
  )
);

drop policy if exists "Signature participants can remove files"
on public.filing_signature_files;

create policy "Signature participants can remove files"
on public.filing_signature_files for delete to authenticated
using (
  exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and private.is_supplier_staff_for_request(signature_request.request_id)
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
          and uploaded_by = (select auth.uid())
          and not exists (
            select 1
            from public.filing_signature_country_confirmations confirmation
            where confirmation.signature_request_id = signature_request.id
              and confirmation.ep_country_id = filing_signature_files.ep_country_id
          )
        )
      )
  )
);

create or replace function private.enforce_signature_poa_country_coverage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft'::public.filing_signature_request_status
    and new.status = 'sent'::public.filing_signature_request_status
    and exists (
      select 1
      from public.translation_requirements requirement
      join unnest(requirement.ep_country_ids) selected_country(id) on true
      join public.ep_countries country
        on country.id = selected_country.id
       and country.poa_requirement <> 'not_required'
      where requirement.request_id = new.request_id
        and requirement.ep_service_type_code in (
          'traditional_validation',
          'traditional_validation_unitary_patent'
        )
        and not exists (
          select 1
          from public.filing_signature_files source_file
          where source_file.signature_request_id = new.id
            and source_file.direction = 'pm_to_requester'
            and source_file.ep_country_id = selected_country.id
        )
    ) then
    raise exception 'Upload at least one POA document for every required country before sending.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_signature_poa_country_coverage() from public;

create trigger enforce_signature_poa_country_coverage
before update of status on public.filing_signature_requests
for each row execute function private.enforce_signature_poa_country_coverage();

create or replace function public.confirm_filing_signature_country(
  p_signature_request_id uuid,
  p_ep_country_id integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signature_request public.filing_signature_requests%rowtype;
  v_completed boolean := false;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can confirm POA countries.' using errcode = '42501';
  end if;

  select * into v_signature_request
  from public.filing_signature_requests
  where id = p_signature_request_id
  for update;

  if not found
    or not private.is_supplier_staff_for_request(v_signature_request.request_id) then
    raise exception 'This POA country is not available for confirmation.' using errcode = '42501';
  end if;

  -- Treat repeated requests as a successful no-op. This also makes retries safe
  -- after the final country has already completed the package.
  if exists (
    select 1
    from public.filing_signature_country_confirmations confirmation
    where confirmation.signature_request_id = p_signature_request_id
      and confirmation.ep_country_id = p_ep_country_id
  ) then
    return v_signature_request.status = 'completed';
  end if;

  if v_signature_request.status <> 'sent' then
    raise exception 'This POA country is not available for confirmation.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.translation_requirements requirement
    join public.ep_countries country
      on country.id = p_ep_country_id
     and country.poa_requirement <> 'not_required'
    where requirement.request_id = v_signature_request.request_id
      and requirement.ep_service_type_code in (
        'traditional_validation',
        'traditional_validation_unitary_patent'
      )
      and p_ep_country_id = any(requirement.ep_country_ids)
  ) or not exists (
    select 1
    from public.filing_signature_files returned_file
    where returned_file.signature_request_id = p_signature_request_id
      and returned_file.direction = 'requester_to_pm'
      and returned_file.ep_country_id = p_ep_country_id
  ) then
    raise exception 'A current returned POA file is required before confirmation.' using errcode = '22023';
  end if;

  insert into public.filing_signature_country_confirmations (
    signature_request_id,
    ep_country_id,
    confirmed_by
  ) values (
    p_signature_request_id,
    p_ep_country_id,
    (select auth.uid())
  ) on conflict (signature_request_id, ep_country_id) do nothing;

  if not exists (
    select 1
    from public.translation_requirements requirement
    join unnest(requirement.ep_country_ids) selected_country(id) on true
    join public.ep_countries country
      on country.id = selected_country.id
     and country.poa_requirement <> 'not_required'
    where requirement.request_id = v_signature_request.request_id
      and requirement.ep_service_type_code in (
        'traditional_validation',
        'traditional_validation_unitary_patent'
      )
      and not exists (
        select 1
        from public.filing_signature_country_confirmations confirmation
        where confirmation.signature_request_id = p_signature_request_id
          and confirmation.ep_country_id = selected_country.id
      )
  ) then
    update public.filing_signature_requests
    set status = 'completed', completed_at = now()
    where id = p_signature_request_id and status = 'sent';

    update public.notifications
    set read_at = coalesce(read_at, now()), updated_at = now()
    where recipient_id = v_signature_request.recipient_id
      and entity_type = 'filing_signature_request'
      and entity_id = p_signature_request_id
      and read_at is null;
    v_completed := true;
  end if;

  insert into public.request_events (
    request_id,
    actor_id,
    event_type,
    payload
  ) values (
    v_signature_request.request_id,
    (select auth.uid()),
    'filing.signature.country_confirmed.pm',
    jsonb_build_object(
      'signatureRequestId', p_signature_request_id,
      'epCountryId', p_ep_country_id,
      'completed', v_completed
    )
  );

  return v_completed;
end;
$$;

revoke all on function public.confirm_filing_signature_country(uuid, integer)
from public, anon;
grant execute on function public.confirm_filing_signature_country(uuid, integer)
to authenticated;

create or replace function public.notify_pm_signature_files_received(
  p_signature_request_id uuid,
  p_submission_id uuid,
  p_country_ids integer[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_signature_request public.filing_signature_requests%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  select * into v_signature_request
  from public.filing_signature_requests
  where id = p_signature_request_id;
  if not found
    or v_signature_request.status <> 'sent'
    or v_signature_request.recipient_id <> (select auth.uid()) then
    raise exception 'This signature request is not available.' using errcode = '42501';
  end if;

  perform private.create_pm_admin_notifications(
    v_signature_request.request_id,
    'pm_signed_documents_received',
    'filing_signature_request',
    v_signature_request.id,
    'pm-signed-documents-received:' || p_submission_id::text,
    private.pm_notification_request_context(v_signature_request.request_id)
      || jsonb_build_object(
        'signatureRequestId', v_signature_request.id,
        'countryIds', coalesce(p_country_ids, '{}'::integer[]),
        'href', '/pm/' || v_signature_request.request_id::text || '#signature-documents'
      )
  );
end;
$$;

revoke all on function public.notify_pm_signature_files_received(uuid, uuid, integer[])
from public, anon;
grant execute on function public.notify_pm_signature_files_received(uuid, uuid, integer[])
to authenticated;

create or replace function private.notify_pm_signed_documents_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Country-scoped POA uploads notify PM as they arrive. Avoid notifying the
  -- confirming PM again when their final confirmation completes the package.
  if old.status = 'sent'::public.filing_signature_request_status
    and new.status = 'completed'::public.filing_signature_request_status
    and not public.is_platform_staff() then
    perform private.create_pm_admin_notifications(
      new.request_id,
      'pm_signed_documents_received',
      'filing_signature_request',
      new.id,
      'pm-signed-documents-received:' || new.id::text,
      private.pm_notification_request_context(new.request_id) || jsonb_build_object(
        'signatureRequestId', new.id,
        'href', '/pm/' || new.request_id::text || '#signature-documents'
      )
    );
  end if;
  return new;
end;
$$;
