-- PM staff can read every quote for a Request. Requesters only receive quotes
-- once PM has sent them, so a saved draft is not exposed by the Data API.
drop policy if exists "Quotes follow request read access" on public.quotes;
create policy "Quotes follow sent requester access"
on public.quotes for select to authenticated
using (
  private.is_supplier_staff_for_request(request_id)
  or (
    private.can_read_request(request_id)
    and status <> 'draft'
  )
);

drop policy if exists "Quote items follow request read access" on public.quote_items;
create policy "Quote items follow sent requester access"
on public.quote_items for select to authenticated
using (exists (
  select 1
  from public.quotes quote
  where quote.id = quote_items.quote_id
    and (
      private.is_supplier_staff_for_request(quote.request_id)
      or (
        private.can_read_request(quote.request_id)
        and quote.status <> 'draft'
      )
    )
));

drop policy if exists "Quote factors follow request read access" on public.quote_factor_snapshots;
create policy "Quote factors follow sent requester access"
on public.quote_factor_snapshots for select to authenticated
using (exists (
  select 1
  from public.quotes quote
  where quote.id = quote_factor_snapshots.quote_id
    and (
      private.is_supplier_staff_for_request(quote.request_id)
      or (
        private.can_read_request(quote.request_id)
        and quote.status <> 'draft'
      )
    )
));

-- This RPC is SECURITY DEFINER, therefore it must repeat the visibility rule
-- instead of relying on the table policy above.
create or replace function public.get_requester_quote_detail(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  request_row public.translation_requests;
  result_quote jsonb;
  result_negotiations jsonb;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.can_read_request(p_request_id) then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;

  select request.* into request_row
  from public.translation_requests request
  where request.id = p_request_id and request.workflow_stage <> 'draft';
  if request_row.id is null then return null; end if;

  select to_jsonb(quote_detail) into result_quote
  from (
    select quote.id, quote.version_no, quote.status, quote.currency, quote.total_amount,
      quote.estimated_delivery_at, quote.valid_until, quote.created_at,
      coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at) from (
        select quote_item.id, quote_item.label, quote_item.amount, quote_item.description,
          quote_item.created_at
        from public.quote_items quote_item where quote_item.quote_id = quote.id
      ) item), '[]'::jsonb) as quote_items
    from public.quotes quote
    where quote.request_id = p_request_id
      and quote.status <> 'draft'
    order by quote.version_no desc
    limit 1
  ) quote_detail;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', negotiation.id, 'quote_id', negotiation.quote_id,
    'initiated_by', negotiation.initiated_by, 'expected_amount', negotiation.expected_amount,
    'expected_delivery_at', negotiation.expected_delivery_at,
    'adjustment_notes', negotiation.adjustment_notes, 'reject_reason', negotiation.reject_reason,
    'pm_decision', negotiation.pm_decision, 'status', negotiation.status,
    'response_quote_id', negotiation.response_quote_id, 'created_at', negotiation.created_at,
    'updated_at', negotiation.updated_at,
    'quote_negotiation_messages', coalesce((select jsonb_agg(to_jsonb(message) order by message.created_at) from (
      select negotiation_message.id, negotiation_message.author_id, negotiation_message.body,
        negotiation_message.expected_amount, negotiation_message.expected_delivery_at,
        negotiation_message.adjustment_notes, negotiation_message.created_at
      from public.quote_negotiation_messages negotiation_message
      where negotiation_message.negotiation_id = negotiation.id
    ) message), '[]'::jsonb)
  ) order by negotiation.created_at), '[]'::jsonb)
  into result_negotiations
  from public.quote_negotiations negotiation
  where negotiation.request_id = p_request_id;

  return jsonb_build_object(
    'request', jsonb_build_object(
      'id', request_row.id,
      'request_no', request_row.request_no,
      'requester_id', request_row.requester_id,
      'requester_status', request_row.requester_status,
      'viewer_is_owner', request_row.requester_id = caller_id,
      'quote_negotiations', result_negotiations
    ),
    'quote', result_quote
  );
end;
$$;

revoke all on function public.get_requester_quote_detail(uuid) from public, anon;
grant execute on function public.get_requester_quote_detail(uuid) to authenticated;
