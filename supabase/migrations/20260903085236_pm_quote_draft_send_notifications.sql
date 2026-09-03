-- Price changes are saved as a PM draft first. Sending is an explicit second
-- action so a requester only sees revisions PM has reviewed.

create or replace function private.create_quote_confirmation_notification(
  target_quote_id uuid,
  target_recipient_id uuid,
  notification_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  quote_row public.quotes;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can create quotation notifications.';
  end if;

  select quote.* into quote_row
  from public.quotes quote
  where quote.id = target_quote_id;

  if not found
    or quote_row.request_id is null
    or not private.is_supplier_staff_for_request(quote_row.request_id) then
    raise exception 'The quotation notification is not available for this PM.';
  end if;

  insert into public.notifications (
    recipient_id, type, entity_type, entity_id, dedupe_key, payload
  ) values (
    target_recipient_id,
    'quote_confirmation_required',
    'quote',
    target_quote_id,
    'quote-confirmation:' || target_quote_id::text,
    notification_payload
  ) on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.create_quote_confirmation_notification(uuid, uuid, jsonb) from public, anon;
grant execute on function private.create_quote_confirmation_notification(uuid, uuid, jsonb) to authenticated, service_role;

create or replace function public.create_pm_quote_revision(
  p_request_id uuid,
  p_currency text,
  p_total_amount numeric,
  p_estimated_delivery_at timestamptz,
  p_notes text,
  p_pricing_snapshot jsonb,
  p_breakdown_json jsonb,
  p_factors jsonb,
  p_quote_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.translation_requests%rowtype;
  v_quote_id uuid := extensions.gen_random_uuid();
  v_version_no integer;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can revise quotations.' using errcode = '42501';
  end if;

  select * into v_request from public.translation_requests
  where id = p_request_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if v_request.workflow_stage = 'completed' then
    raise exception 'Completed Requests cannot be repriced.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotes where request_id = p_request_id and status = 'sent') then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.quotes where request_id = p_request_id;

  update public.quotes set status = 'superseded'
  where request_id = p_request_id and status in ('draft', 'generated', 'accepted');

  insert into public.quotes (
    id, request_id, version_no, status, currency, total_amount,
    estimated_delivery_at, valid_until, notes, pricing_snapshot, breakdown_json
  ) values (
    v_quote_id, p_request_id, v_version_no, 'draft', p_currency, p_total_amount,
    p_estimated_delivery_at, now() + interval '7 days', p_notes,
    p_pricing_snapshot, p_breakdown_json
  );

  insert into public.quote_items (quote_id, label, amount, quantity, unit, description)
  select v_quote_id, coalesce(item->>'label', 'Quotation item'),
    coalesce((item->>'amount')::numeric, 0), nullif(item->>'quantity', '')::numeric,
    nullif(item->>'unit', ''), nullif(item->>'description', '')
  from jsonb_array_elements(p_quote_items) item;
  insert into public.quote_factor_snapshots (quote_id, factors) values (v_quote_id, p_factors);
  return v_quote_id;
end;
$$;

create or replace function public.send_pm_quote_revision(p_quote_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_request public.translation_requests%rowtype;
  v_matter text;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can send quotations.' using errcode = '42501';
  end if;
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quotation not found.' using errcode = 'P0002'; end if;
  if v_quote.status <> 'draft' then raise exception 'Only a saved draft quotation can be sent.' using errcode = '22023'; end if;
  select * into v_request from public.translation_requests where id = v_quote.request_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if exists (select 1 from public.quotes where request_id = v_request.id and status = 'sent') then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  update public.quotes set status = 'sent' where id = v_quote.id;
  update public.translation_requests
  set workflow_stage = 'quoted', requester_status = 'responding', pm_status = 'responding'
  where id = v_request.id;
  select coalesce(patent.patent_number, v_request.title, v_request.request_no) into v_matter
  from public.request_patents patent where patent.request_id = v_request.id limit 1;
  perform private.create_quote_confirmation_notification(
    v_quote.id,
    v_request.requester_id,
    jsonb_build_object(
      'requestId', v_request.id, 'requestNo', v_request.request_no,
      'matter', coalesce(v_matter, v_request.request_no),
      'quoteId', v_quote.id,
      'href', '/requester/requests/' || v_request.id::text || '#quotation'
    )
  );
  return v_quote.id;
end;
$$;

revoke all on function public.send_pm_quote_revision(uuid) from public, anon;
grant execute on function public.send_pm_quote_revision(uuid) to authenticated;

create or replace function public.open_requester_notification(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  notification_row public.notifications;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.notifications notification
  set read_at = coalesce(notification.read_at, now()), updated_at = now()
  where notification.id = p_notification_id
    and notification.recipient_id = caller_id
    and notification.type in (
      'filing_signature_required', 'quote_confirmation_required',
      'request_completed', 'request_deadline_approaching'
    )
  returning notification.* into notification_row;
  if notification_row.id is null then raise exception 'Notification not found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', notification_row.id, 'type', notification_row.type,
    'payload', notification_row.payload, 'read_at', notification_row.read_at,
    'created_at', notification_row.created_at
  );
end;
$$;
