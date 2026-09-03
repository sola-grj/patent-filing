-- Keep notification creation inside the signature-send transaction without
-- depending on a table policy that is evaluated through the RPC's invoker.
-- This private function is not exposed through the Data API and repeats the
-- request-specific PM authorization before bypassing notification-table RLS.
create or replace function private.create_filing_signature_notification(
  target_signature_request_id uuid,
  target_recipient_id uuid,
  notification_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  signature_request public.filing_signature_requests;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM or operations staff can create signature notifications.';
  end if;

  select *
  into signature_request
  from public.filing_signature_requests
  where id = target_signature_request_id;

  if not found
    or signature_request.recipient_id <> target_recipient_id
    or not private.is_supplier_staff_for_request(signature_request.request_id) then
    raise exception 'The signature notification is not available for this PM.';
  end if;

  insert into public.notifications (
    recipient_id,
    type,
    entity_type,
    entity_id,
    dedupe_key,
    payload
  ) values (
    target_recipient_id,
    'filing_signature_required',
    'filing_signature_request',
    target_signature_request_id,
    'signature:' || target_signature_request_id::text,
    notification_payload
  )
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.create_filing_signature_notification(uuid, uuid, jsonb)
from public, anon;
grant execute on function private.create_filing_signature_notification(uuid, uuid, jsonb)
to authenticated, service_role;

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
  patent_number text;
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

  select request_patent.patent_number
  into patent_number
  from public.request_patents request_patent
  where request_patent.request_id = signature_request.request_id
  order by request_patent.created_at asc
  limit 1;

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

  perform private.create_filing_signature_notification(
    signature_request.id,
    signature_request.recipient_id,
    jsonb_build_object(
      'requestId', signature_request.request_id,
      'requestNo', request_row.request_no,
      'matter', coalesce(patent_number, request_row.title, request_row.request_no),
      'fileCount', source_file_count,
      'dueAt', signature_request.due_at,
      'sentAt', signature_request.sent_at,
      'href', '/requester/requests/' || signature_request.request_id::text || '#signature-documents'
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
