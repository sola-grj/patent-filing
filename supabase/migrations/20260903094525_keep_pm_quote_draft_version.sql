-- A PM may refine the current draft repeatedly. The draft remains the next
-- quotation version until it is explicitly sent to the requester.
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
  v_quote_id uuid;
  v_version_no integer;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can revise quotations.' using errcode = '42501';
  end if;

  select * into v_request
  from public.translation_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if v_request.workflow_stage = 'completed' then
    raise exception 'Completed Requests cannot be repriced.' using errcode = '22023';
  end if;
  if exists (select 1 from public.quotes where request_id = p_request_id and status = 'sent') then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  select id into v_quote_id
  from public.quotes
  where request_id = p_request_id and status = 'draft'
  order by version_no desc
  limit 1
  for update;

  if found then
    update public.quotes
    set currency = p_currency,
        total_amount = p_total_amount,
        estimated_delivery_at = p_estimated_delivery_at,
        valid_until = now() + interval '7 days',
        notes = p_notes,
        pricing_snapshot = p_pricing_snapshot,
        breakdown_json = p_breakdown_json
    where id = v_quote_id;

    delete from public.quote_items where quote_id = v_quote_id;
    delete from public.quote_factor_snapshots where quote_id = v_quote_id;
  else
    select coalesce(max(version_no), 0) + 1 into v_version_no
    from public.quotes where request_id = p_request_id;

    update public.quotes set status = 'superseded'
    where request_id = p_request_id and status in ('generated', 'accepted');

    v_quote_id := extensions.gen_random_uuid();
    insert into public.quotes (
      id, request_id, version_no, status, currency, total_amount,
      estimated_delivery_at, valid_until, notes, pricing_snapshot, breakdown_json
    ) values (
      v_quote_id, p_request_id, v_version_no, 'draft', p_currency, p_total_amount,
      p_estimated_delivery_at, now() + interval '7 days', p_notes,
      p_pricing_snapshot, p_breakdown_json
    );
  end if;

  insert into public.quote_items (quote_id, label, amount, quantity, unit, description)
  select v_quote_id, coalesce(item->>'label', 'Quotation item'),
    coalesce((item->>'amount')::numeric, 0), nullif(item->>'quantity', '')::numeric,
    nullif(item->>'unit', ''), nullif(item->>'description', '')
  from jsonb_array_elements(p_quote_items) item;
  insert into public.quote_factor_snapshots (quote_id, factors) values (v_quote_id, p_factors);

  return v_quote_id;
end;
$$;

revoke all on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
