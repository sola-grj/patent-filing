-- A revised quotation remains an active negotiation after PM sends it.
-- The previous send function reset both portal lifecycle statuses to responding.
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

  select * into v_quote
  from public.quotes
  where id = p_quote_id
  for update;
  if not found then raise exception 'Quotation not found.' using errcode = 'P0002'; end if;
  if v_quote.status <> 'draft' then
    raise exception 'Only a saved draft quotation can be sent.' using errcode = '22023';
  end if;

  select * into v_request
  from public.translation_requests
  where id = v_quote.request_id
  for update;
  if not found then raise exception 'Request not found.' using errcode = 'P0002'; end if;
  if exists (
    select 1 from public.quotes
    where request_id = v_request.id and status = 'sent'
  ) then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;

  update public.quotes
  set status = 'sent'
  where id = v_quote.id;

  update public.translation_requests
  set workflow_stage = 'negotiation',
      requester_status = 'negotiation',
      pm_status = 'negotiation'
  where id = v_request.id;

  select coalesce(patent.patent_number, v_request.title, v_request.request_no)
  into v_matter
  from public.request_patents patent
  where patent.request_id = v_request.id
  limit 1;

  perform private.create_quote_confirmation_notification(
    v_quote.id,
    v_request.requester_id,
    jsonb_build_object(
      'requestId', v_request.id,
      'requestNo', v_request.request_no,
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

-- Repair revisions saved or sent before the lifecycle transition was deployed.
update public.translation_requests request
set workflow_stage = 'negotiation',
    requester_status = 'negotiation',
    pm_status = 'negotiation'
where request.workflow_stage <> 'completed'
  and exists (
    select 1
    from public.quotes quote
    where quote.request_id = request.id
      and quote.status in ('draft', 'sent')
      and coalesce(
        quote.breakdown_json->>'source',
        quote.pricing_snapshot->>'source'
      ) = 'pm_erp_revision'
  );
