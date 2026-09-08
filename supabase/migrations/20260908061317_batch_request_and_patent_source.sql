-- Cold patent submissions used to insert/update the Request in one HTTP call
-- and persist its source graph in another. Keep both writes in one ownership-
-- checked transaction while retaining the same draft-only semantics.
create or replace function public.upsert_draft_request_and_patent_source(
  p_request_id uuid,
  p_request jsonb,
  p_patent jsonb,
  p_analysis jsonb,
  p_files jsonb,
  p_create_parse_results boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  request_owner uuid;
  request_no text;
  request_file_ids uuid[];
  target_organization_id uuid := (p_request->>'organization_id')::uuid;
  target_supplier_organization_id uuid := (p_request->>'supplier_organization_id')::uuid;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if (p_request->>'requester_id')::uuid <> caller_id
    or not private.is_customer_member(target_organization_id) then
    raise exception 'Requester organization access changed' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = target_organization_id
      and relationship.supplier_organization_id = target_supplier_organization_id
      and relationship.status = 'active'
  ) then
    raise exception 'Your organization is not linked to this supplier' using errcode = '42501';
  end if;

  select request.requester_id into request_owner
  from public.translation_requests request
  where request.id = p_request_id
  for update;

  if request_owner is null then
    insert into public.translation_requests (
      id, organization_id, supplier_organization_id, requester_id, reference_no,
      source_mode, channel_code, title, workflow_stage, requester_status,
      pm_status, draft_payload, last_draft_step, submitted_at
    ) values (
      p_request_id, target_organization_id, target_supplier_organization_id, caller_id,
      nullif(p_request->>'reference_no', ''), 'patent_search'::public.request_source_mode,
      p_request->>'channel_code', null, 'draft'::public.workflow_stage,
      'responding'::public.request_lifecycle_status,
      'responding'::public.request_lifecycle_status,
      coalesce(p_request->'draft_payload', '{}'::jsonb), p_request->>'last_draft_step', null
    ) returning request_no into request_no;
  elsif request_owner <> caller_id then
    raise exception 'Draft Request is not editable' using errcode = '42501';
  else
    update public.translation_requests request
    set organization_id = target_organization_id,
        supplier_organization_id = target_supplier_organization_id,
        reference_no = nullif(p_request->>'reference_no', ''),
        source_mode = 'patent_search'::public.request_source_mode,
        channel_code = p_request->>'channel_code',
        workflow_stage = 'draft'::public.workflow_stage,
        requester_status = 'responding'::public.request_lifecycle_status,
        pm_status = 'responding'::public.request_lifecycle_status,
        draft_payload = coalesce(p_request->'draft_payload', '{}'::jsonb),
        last_draft_step = p_request->>'last_draft_step',
        submitted_at = null,
        updated_at = now()
    where request.id = p_request_id
      and request.workflow_stage = 'draft'::public.workflow_stage
    returning request.request_no into request_no;
    if request_no is null then
      raise exception 'Draft Request is not editable' using errcode = '42501';
    end if;
  end if;

  if p_create_parse_results then
    request_file_ids := public.persist_patent_source_and_parse_for_wizard(
      p_request_id, p_patent, p_analysis, p_files
    );
  else
    request_file_ids := public.persist_patent_source_for_wizard(
      p_request_id, p_patent, p_analysis, p_files, false
    );
  end if;

  return jsonb_build_object('request_no', request_no, 'request_file_ids', request_file_ids);
end;
$$;

revoke all on function public.upsert_draft_request_and_patent_source(uuid, jsonb, jsonb, jsonb, jsonb, boolean)
  from public, anon;
grant execute on function public.upsert_draft_request_and_patent_source(uuid, jsonb, jsonb, jsonb, jsonb, boolean)
  to authenticated;
