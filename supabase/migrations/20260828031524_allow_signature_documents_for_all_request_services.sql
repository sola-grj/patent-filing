-- Copyright (c) 2026 sola
--
-- This software is released under the MIT License.
-- https://opensource.org/licenses/MIT
-- Signature/POA documents are available for every in-progress Request,
-- including EP Granting, Traditional Validation, Unitary Patent, and combined EP services.
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
