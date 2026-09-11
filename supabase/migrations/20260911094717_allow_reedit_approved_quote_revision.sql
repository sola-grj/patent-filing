-- An approved draft may be reopened by a PM before customer delivery. The
-- approved snapshot is cancelled for audit purposes, while the same quote row
-- (and therefore the same version number) remains the working draft.
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
language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  v_request public.translation_requests%rowtype;
  v_quote_id uuid;
  v_version_no integer;
  v_active_approval public.approval_requests%rowtype;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_request from public.translation_requests where id = p_request_id for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if not private.current_supplier_role(v_request.supplier_organization_id, 'pm') then
    raise exception 'Only a PM can revise quotations.' using errcode = '42501';
  end if;
  if v_request.workflow_stage = 'completed' then raise exception 'Completed Requests cannot be repriced.' using errcode = '22023'; end if;
  if exists (select 1 from public.quotes where request_id = p_request_id and status = 'sent') then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  select id into v_quote_id from public.quotes
  where request_id = p_request_id and status = 'draft'
  order by version_no desc limit 1 for update;

  if found then
    select * into v_active_approval from public.approval_requests
    where approval_type = 'quote_revision' and subject_id = v_quote_id
      and status in ('pending', 'approved') and sent_at is null
    order by submitted_at desc limit 1 for update;

    if v_active_approval.status = 'pending' then
      raise exception 'This quotation is pending approval and cannot be changed.' using errcode = '55000';
    end if;

    if v_active_approval.status = 'approved' then
      update public.approval_requests
      set status = 'cancelled'
      where id = v_active_approval.id;

      insert into public.request_events(request_id, actor_id, event_type, from_status, to_status, payload)
      values (
        v_request.id,
        caller_id,
        'quote_revision.reopened',
        v_request.workflow_stage::text,
        v_request.workflow_stage::text,
        jsonb_build_object(
          'approvalId', v_active_approval.id,
          'quoteId', v_quote_id,
          'reason', 'approved_revision_edited_before_send'
        )
      );
    end if;

    update public.quotes set currency = p_currency, total_amount = p_total_amount,
      estimated_delivery_at = p_estimated_delivery_at, valid_until = now() + interval '7 days',
      notes = p_notes, pricing_snapshot = p_pricing_snapshot, breakdown_json = p_breakdown_json
    where id = v_quote_id;
    delete from public.quote_items where quote_id = v_quote_id;
    delete from public.quote_factor_snapshots where quote_id = v_quote_id;
  else
    select coalesce(max(version_no), 0) + 1 into v_version_no from public.quotes where request_id = p_request_id;
    update public.quotes set status = 'superseded'
    where request_id = p_request_id and status in ('generated', 'accepted');
    v_quote_id := extensions.gen_random_uuid();
    insert into public.quotes (
      id, request_id, version_no, status, currency, total_amount, estimated_delivery_at,
      valid_until, notes, pricing_snapshot, breakdown_json
    ) values (
      v_quote_id, p_request_id, v_version_no, 'draft', p_currency, p_total_amount,
      p_estimated_delivery_at, now() + interval '7 days', p_notes, p_pricing_snapshot, p_breakdown_json
    );
  end if;

  insert into public.quote_items (quote_id, label, amount, quantity, unit, description)
  select v_quote_id, coalesce(item->>'label', 'Quotation item'), coalesce((item->>'amount')::numeric, 0),
    nullif(item->>'quantity', '')::numeric, nullif(item->>'unit', ''), nullif(item->>'description', '')
  from jsonb_array_elements(p_quote_items) item;
  insert into public.quote_factor_snapshots (quote_id, factors) values (v_quote_id, p_factors);
  return v_quote_id;
end;
$$;

revoke all on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
