-- PM price revisions are immutable quote versions.  Both functions serialize
-- against the parent Request row so one Request can never have two pending
-- customer confirmations.

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

  select * into v_request
  from public.translation_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_request.workflow_stage = 'completed' then
    raise exception 'Completed Requests cannot be repriced.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.quotes
    where request_id = p_request_id and status = 'sent'
  ) then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  select coalesce(max(version_no), 0) + 1 into v_version_no
  from public.quotes
  where request_id = p_request_id;

  update public.quotes
  set status = 'superseded'
  where request_id = p_request_id
    and status in ('draft', 'generated', 'accepted');

  insert into public.quotes (
    id, request_id, version_no, status, currency, total_amount,
    estimated_delivery_at, valid_until, notes, pricing_snapshot, breakdown_json
  ) values (
    v_quote_id, p_request_id, v_version_no, 'sent', p_currency, p_total_amount,
    p_estimated_delivery_at, now() + interval '7 days', p_notes,
    p_pricing_snapshot, p_breakdown_json
  );

  insert into public.quote_items (quote_id, label, amount, quantity, unit, description)
  select v_quote_id,
    coalesce(item->>'label', 'Quotation item'),
    coalesce((item->>'amount')::numeric, 0),
    nullif(item->>'quantity', '')::numeric,
    nullif(item->>'unit', ''),
    nullif(item->>'description', '')
  from jsonb_array_elements(p_quote_items) item;

  insert into public.quote_factor_snapshots (quote_id, factors)
  values (v_quote_id, p_factors);

  update public.translation_requests
  set workflow_stage = 'quoted', requester_status = 'responding', pm_status = 'responding'
  where id = p_request_id;

  return v_quote_id;
end;
$$;

create or replace function public.confirm_latest_quote(
  p_request_id uuid,
  p_quote_id uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.translation_requests%rowtype;
  v_quote public.quotes%rowtype;
  v_latest_quote_id uuid;
begin
  select * into v_request
  from public.translation_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Request not found.' using errcode = 'P0002';
  end if;
  if v_request.requester_id <> auth.uid() then
    raise exception 'Only the Request creator can confirm this quotation.' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes
  where id = p_quote_id and request_id = p_request_id
  for update;
  if not found or v_quote.status <> 'sent' then
    raise exception 'This quotation is not awaiting confirmation.' using errcode = '22023';
  end if;

  select id into v_latest_quote_id from public.quotes
  where request_id = p_request_id
  order by version_no desc
  limit 1;
  if v_latest_quote_id <> p_quote_id then
    raise exception 'Only the latest quotation can be confirmed.' using errcode = '22023';
  end if;

  update public.quotes set status = 'accepted' where id = p_quote_id;
  update public.translation_requests
  set workflow_stage = 'quoted', requester_status = 'responding', pm_status = 'responding'
  where id = p_request_id;

  return p_quote_id;
end;
$$;

revoke all on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke all on function public.confirm_latest_quote(uuid, uuid) from public, anon;
grant execute on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.confirm_latest_quote(uuid, uuid) to authenticated;
