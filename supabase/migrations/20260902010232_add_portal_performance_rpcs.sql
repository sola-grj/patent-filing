-- Consolidate the portal bootstrap and the three highest-traffic list reads.
-- Every SECURITY DEFINER function below authenticates and authorizes the caller
-- explicitly, uses an empty search_path, and exposes only a fixed JSON shape.

create or replace function public.get_portal_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  result jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'user_id', caller_id,
    'profile', coalesce((
      select jsonb_build_object(
        'display_name', profile.display_name,
        'email', profile.email,
        'password_setup_required', profile.password_setup_required
      )
      from public.profiles profile
      where profile.user_id = caller_id
    ), '{}'::jsonb),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', member.id,
        'organization_id', member.organization_id,
        'role', member.role,
        'is_org_admin', member.is_org_admin,
        'organization', jsonb_build_object(
          'id', organization.id,
          'name', organization.name,
          'type', organization.type
        ),
        'supplier_organization_id', relationship.supplier_organization_id,
        'request_sharing_enabled', coalesce(settings.request_sharing_enabled, false)
      ) order by member.created_at, member.id)
      from public.organization_members member
      join public.organizations organization on organization.id = member.organization_id
      left join public.customer_supplier_relationships relationship
        on relationship.customer_organization_id = member.organization_id
       and relationship.status = 'active'
      left join public.customer_organization_settings settings
        on settings.organization_id = member.organization_id
      where member.user_id = caller_id
    ), '[]'::jsonb),
    'unread_count', (
      select count(*)
      from public.notifications notification
      where notification.recipient_id = caller_id
        and notification.read_at is null
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_portal_context() from public, anon;
grant execute on function public.get_portal_context() to authenticated;

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
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.notifications notification
  set read_at = coalesce(notification.read_at, now()), updated_at = now()
  where notification.id = p_notification_id
    and notification.recipient_id = caller_id
    and notification.type in (
      'filing_signature_required',
      'request_completed',
      'request_deadline_approaching'
    )
  returning notification.* into notification_row;

  if notification_row.id is null then
    raise exception 'Notification not found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'id', notification_row.id,
    'type', notification_row.type,
    'payload', notification_row.payload,
    'read_at', notification_row.read_at,
    'created_at', notification_row.created_at
  );
end;
$$;

revoke all on function public.open_requester_notification(uuid) from public, anon;
grant execute on function public.open_requester_notification(uuid) to authenticated;

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

create or replace function public.get_requester_request_page(
  p_status text default null,
  p_channel text default null,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 10,
  p_scope text default 'mine'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  customer_org_id uuid;
  sharing_enabled boolean := false;
  effective_scope text := 'mine';
  requested_page integer := greatest(coalesce(p_page, 1), 1);
  requested_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  total_rows bigint;
  safe_page integer;
  result_items jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select member.organization_id, coalesce(settings.request_sharing_enabled, false)
    into customer_org_id, sharing_enabled
  from public.organization_members member
  join public.organizations organization
    on organization.id = member.organization_id and organization.type = 'customer'
  left join public.customer_organization_settings settings
    on settings.organization_id = member.organization_id
  where member.user_id = caller_id and member.role = 'requester'
  order by member.created_at, member.id
  limit 1;

  if customer_org_id is null then
    raise exception 'Requester workspace required' using errcode = '42501';
  end if;
  if p_scope = 'organization' and sharing_enabled then
    effective_scope := 'organization';
  end if;

  with filtered as (
    select request.id
    from public.translation_requests request
    where request.workflow_stage <> 'draft'
      and case when effective_scope = 'organization'
        then request.organization_id = customer_org_id and request.requester_id <> caller_id
        else request.requester_id = caller_id
      end
      and (p_status is null or p_status = 'all' or request.requester_status::text = p_status)
      and (p_channel is null or p_channel = 'all' or request.channel_code = p_channel)
      and (
        nullif(trim(p_query), '') is null
        or request.request_no ilike '%' || trim(p_query) || '%'
        or coalesce(request.reference_no, '') ilike '%' || trim(p_query) || '%'
        or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from public.patent_searches search where search.request_id = request.id and search.query ilike '%' || trim(p_query) || '%')
        or exists (select 1 from public.request_patents patent where patent.request_id = request.id and patent.patent_number ilike '%' || trim(p_query) || '%')
        or regexp_replace(upper(coalesce(request.reference_no, '') || coalesce(request.request_no, '') || coalesce(request.title, '')), '[^A-Z0-9]', '', 'g')
          like '%' || regexp_replace(upper(trim(p_query)), '[^A-Z0-9]', '', 'g') || '%'
      )
  ) select count(*) into total_rows from filtered;

  safe_page := least(requested_page, greatest(ceil(total_rows::numeric / requested_size)::integer, 1));

  with page_rows as (
    select request.*
    from public.translation_requests request
    where request.id in (
      select filtered.id
      from (
        select request.id, request.updated_at
        from public.translation_requests request
        where request.workflow_stage <> 'draft'
          and case when effective_scope = 'organization'
            then request.organization_id = customer_org_id and request.requester_id <> caller_id
            else request.requester_id = caller_id
          end
          and (p_status is null or p_status = 'all' or request.requester_status::text = p_status)
          and (p_channel is null or p_channel = 'all' or request.channel_code = p_channel)
          and (
            nullif(trim(p_query), '') is null
            or request.request_no ilike '%' || trim(p_query) || '%'
            or coalesce(request.reference_no, '') ilike '%' || trim(p_query) || '%'
            or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
            or exists (select 1 from public.patent_searches search where search.request_id = request.id and search.query ilike '%' || trim(p_query) || '%')
            or exists (select 1 from public.request_patents patent where patent.request_id = request.id and patent.patent_number ilike '%' || trim(p_query) || '%')
            or regexp_replace(upper(coalesce(request.reference_no, '') || coalesce(request.request_no, '') || coalesce(request.title, '')), '[^A-Z0-9]', '', 'g')
              like '%' || regexp_replace(upper(trim(p_query)), '[^A-Z0-9]', '', 'g') || '%'
          )
        order by request.updated_at desc, request.id desc
        limit requested_size offset ((safe_page - 1) * requested_size)
      ) filtered
    )
    order by request.updated_at desc, request.id desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id,
    'request_no', request.request_no,
    'reference_no', request.reference_no,
    'requester_id', request.requester_id,
    'title', request.title,
    'channel_code', request.channel_code,
    'requester_status', request.requester_status,
    'workflow_stage', request.workflow_stage,
    'submitted_at', request.submitted_at,
    'updated_at', request.updated_at,
    'file_count', (select count(*) from public.request_files file where file.request_id = request.id),
    'translation_requirements', coalesce((select jsonb_agg(to_jsonb(requirement)) from (
      select source_language, target_language, target_languages, jurisdiction_codes, service_types,
             is_urgent, epv_type_code, ep_service_type_code, pct_chapter_code
      from public.translation_requirements where request_id = request.id limit 1
    ) requirement), '[]'::jsonb),
    'request_patents', coalesce((select jsonb_agg(to_jsonb(patent)) from (
      select patent_number, application_no, publication_no, first_priority_date,
             international_filing_date, grant_publication_date, rule_71_3_communication_date
      from public.request_patents where request_id = request.id order by created_at limit 1
    ) patent), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(quote)) from (
      select id, total_amount, currency, status, created_at
      from public.quotes where request_id = request.id order by version_no desc limit 1
    ) quote), '[]'::jsonb)
  ) order by request.updated_at desc, request.id desc), '[]'::jsonb)
  into result_items from page_rows request;

  return jsonb_build_object(
    'items', result_items,
    'total_count', total_rows,
    'page', safe_page,
    'page_size', requested_size,
    'scope', effective_scope,
    'request_sharing_enabled', sharing_enabled,
    'organization_id', customer_org_id
  );
end;
$$;

revoke all on function public.get_requester_request_page(text, text, text, integer, integer, text) from public, anon;
grant execute on function public.get_requester_request_page(text, text, text, integer, integer, text) to authenticated;

create or replace function public.get_requester_draft_page(
  p_channel text default null,
  p_service text default null,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  customer_org_id uuid;
  requested_page integer := greatest(coalesce(p_page, 1), 1);
  requested_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  total_rows bigint;
  safe_page integer;
  result_items jsonb;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select member.organization_id into customer_org_id
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id and organization.type = 'customer'
  where member.user_id = caller_id and member.role = 'requester'
  order by member.created_at, member.id limit 1;
  if customer_org_id is null then raise exception 'Requester workspace required' using errcode = '42501'; end if;

  with filtered as (
    select request.id
    from public.translation_requests request
    left join public.translation_requirements requirement on requirement.request_id = request.id
    where request.requester_id = caller_id and request.workflow_stage = 'draft'
      and (p_channel is null or p_channel = 'all' or
        case when request.source_mode = 'upload' then 'upload_files'
             else coalesce(request.draft_payload #>> '{config,channelCode}', request.channel_code, '') end = p_channel)
      and (p_service is null or p_service = 'all' or exists (
        select 1 from unnest(coalesce(requirement.service_types, '{}'::public.translation_service_type[])) service
        where service::text = p_service
      ) or request.draft_payload #> '{config,serviceTypes}' ? p_service)
      and (nullif(trim(p_query), '') is null
        or request.request_no ilike '%' || trim(p_query) || '%'
        or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
        or coalesce(request.draft_payload #>> '{patentQuery}', '') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from public.patent_searches search where search.request_id = request.id and search.query ilike '%' || trim(p_query) || '%')
        or exists (select 1 from public.request_patents patent where patent.request_id = request.id and (patent.patent_number ilike '%' || trim(p_query) || '%' or coalesce(patent.title, '') ilike '%' || trim(p_query) || '%'))
        or exists (select 1 from public.request_files file where file.request_id = request.id and file.original_filename ilike '%' || trim(p_query) || '%'))
  ) select count(*) into total_rows from filtered;
  safe_page := least(requested_page, greatest(ceil(total_rows::numeric / requested_size)::integer, 1));

  with page_rows as (
    select request.*
    from public.translation_requests request
    left join public.translation_requirements requirement on requirement.request_id = request.id
    where request.requester_id = caller_id and request.workflow_stage = 'draft'
      and (p_channel is null or p_channel = 'all' or
        case when request.source_mode = 'upload' then 'upload_files'
             else coalesce(request.draft_payload #>> '{config,channelCode}', request.channel_code, '') end = p_channel)
      and (p_service is null or p_service = 'all' or exists (
        select 1 from unnest(coalesce(requirement.service_types, '{}'::public.translation_service_type[])) service
        where service::text = p_service
      ) or request.draft_payload #> '{config,serviceTypes}' ? p_service)
      and (nullif(trim(p_query), '') is null
        or request.request_no ilike '%' || trim(p_query) || '%'
        or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
        or coalesce(request.draft_payload #>> '{patentQuery}', '') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from public.patent_searches search where search.request_id = request.id and search.query ilike '%' || trim(p_query) || '%')
        or exists (select 1 from public.request_patents patent where patent.request_id = request.id and (patent.patent_number ilike '%' || trim(p_query) || '%' or coalesce(patent.title, '') ilike '%' || trim(p_query) || '%'))
        or exists (select 1 from public.request_files file where file.request_id = request.id and file.original_filename ilike '%' || trim(p_query) || '%'))
    order by request.updated_at desc, request.id desc
    limit requested_size offset ((safe_page - 1) * requested_size)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id, 'request_no', request.request_no, 'title', request.title,
    'source_mode', request.source_mode, 'workflow_stage', request.workflow_stage,
    'updated_at', request.updated_at, 'last_draft_step', request.last_draft_step,
    'draft_payload', request.draft_payload,
    'request_patents', coalesce((select jsonb_agg(to_jsonb(patent)) from (select patent_number, title from public.request_patents where request_id = request.id order by created_at limit 1) patent), '[]'::jsonb),
    'patent_searches', coalesce((select jsonb_agg(to_jsonb(search)) from (select query from public.patent_searches where request_id = request.id order by created_at limit 1) search), '[]'::jsonb),
    'translation_requirements', coalesce((select jsonb_agg(to_jsonb(requirement)) from (select service_types, ep_service_type_code from public.translation_requirements where request_id = request.id limit 1) requirement), '[]'::jsonb),
    'request_files', coalesce((select jsonb_agg(to_jsonb(file) order by file.created_at) from (select id, source, status, patent_document_id, original_filename, mime_type, metadata, created_at from public.request_files where request_id = request.id) file), '[]'::jsonb)
  ) order by request.updated_at desc, request.id desc), '[]'::jsonb)
  into result_items from page_rows request;

  return jsonb_build_object('items', result_items, 'total_count', total_rows, 'page', safe_page,
    'page_size', requested_size, 'organization_id', customer_org_id);
end;
$$;

revoke all on function public.get_requester_draft_page(text, text, text, integer, integer) from public, anon;
grant execute on function public.get_requester_draft_page(text, text, text, integer, integer) to authenticated;

create or replace function public.get_pm_request_page(
  p_status text default null,
  p_channel text default null,
  p_customer uuid default null,
  p_query text default null,
  p_page integer default 1,
  p_page_size integer default 10
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  supplier_org_id uuid;
  requested_page integer := greatest(coalesce(p_page, 1), 1);
  requested_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  total_rows bigint;
  safe_page integer;
  result_items jsonb;
  customer_items jsonb;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select member.organization_id into supplier_org_id
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id and organization.type = 'supplier'
  where member.user_id = caller_id and member.role in ('pm', 'ops', 'admin')
  order by (member.role = 'admin') desc, member.created_at, member.id limit 1;
  if supplier_org_id is null then raise exception 'PM workspace required' using errcode = '42501'; end if;

  with filtered as (
    select request.id
    from public.translation_requests request
    join public.organizations organization on organization.id = request.organization_id
    left join public.eci_erp_customers customer on customer.auth_user_id = request.requester_id and customer.sync_error is null
    where request.supplier_organization_id = supplier_org_id and request.workflow_stage <> 'draft'
      and (p_status is null or p_status = 'all' or request.pm_status::text = p_status)
      and (p_channel is null or p_channel = 'all' or request.channel_code = p_channel)
      and (p_customer is null or request.organization_id = p_customer)
      and (nullif(trim(p_query), '') is null
        or request.request_no ilike '%' || trim(p_query) || '%'
        or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
        or organization.name ilike '%' || trim(p_query) || '%'
        or coalesce(customer.client_name, '') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from public.request_patents patent where patent.request_id = request.id and patent.patent_number ilike '%' || trim(p_query) || '%'))
  ) select count(*) into total_rows from filtered;
  safe_page := least(requested_page, greatest(ceil(total_rows::numeric / requested_size)::integer, 1));

  with page_rows as (
    select request.*, organization.name as organization_name, customer.client_name as erp_customer_name
    from public.translation_requests request
    join public.organizations organization on organization.id = request.organization_id
    left join public.eci_erp_customers customer on customer.auth_user_id = request.requester_id and customer.sync_error is null
    where request.supplier_organization_id = supplier_org_id and request.workflow_stage <> 'draft'
      and (p_status is null or p_status = 'all' or request.pm_status::text = p_status)
      and (p_channel is null or p_channel = 'all' or request.channel_code = p_channel)
      and (p_customer is null or request.organization_id = p_customer)
      and (nullif(trim(p_query), '') is null
        or request.request_no ilike '%' || trim(p_query) || '%'
        or coalesce(request.title, '') ilike '%' || trim(p_query) || '%'
        or organization.name ilike '%' || trim(p_query) || '%'
        or coalesce(customer.client_name, '') ilike '%' || trim(p_query) || '%'
        or exists (select 1 from public.request_patents patent where patent.request_id = request.id and patent.patent_number ilike '%' || trim(p_query) || '%'))
    order by request.updated_at desc, request.id desc
    limit requested_size offset ((safe_page - 1) * requested_size)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', request.id, 'request_no', request.request_no, 'requester_id', request.requester_id,
    'title', request.title, 'channel_code', request.channel_code, 'workflow_stage', request.workflow_stage,
    'pm_status', request.pm_status, 'requester_status', request.requester_status,
    'updated_at', request.updated_at, 'submitted_at', request.submitted_at,
    'customer_name', coalesce(nullif(trim(request.erp_customer_name), ''), request.organization_name),
    'organizations', jsonb_build_array(jsonb_build_object('id', request.organization_id, 'name', request.organization_name)),
    'file_count', (select count(*) from public.request_files file where file.request_id = request.id),
    'request_patents', coalesce((select jsonb_agg(to_jsonb(patent)) from (select patent_number, application_no, publication_no, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date from public.request_patents where request_id = request.id order by created_at limit 1) patent), '[]'::jsonb),
    'translation_requirements', coalesce((select jsonb_agg(to_jsonb(requirement)) from (select source_language, target_language, target_languages, service_types, is_urgent, jurisdiction_codes, epv_type_code, ep_service_type_code, pct_chapter_code from public.translation_requirements where request_id = request.id limit 1) requirement), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(quote)) from (select id, total_amount, currency, status, created_at from public.quotes where request_id = request.id order by version_no desc limit 1) quote), '[]'::jsonb),
    'quote_negotiations', coalesce((select jsonb_agg(to_jsonb(negotiation)) from (select id, status, pm_decision, created_at from public.quote_negotiations where request_id = request.id order by created_at desc limit 1) negotiation), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(request_order)) from (select id, status, offline_confirmation_status from public.orders where request_id = request.id limit 1) request_order), '[]'::jsonb)
  ) order by request.updated_at desc, request.id desc), '[]'::jsonb)
  into result_items from page_rows request;

  select coalesce(jsonb_agg(jsonb_build_object('value', customer.organization_id, 'label', customer.customer_name) order by customer.customer_name), '[]'::jsonb)
  into customer_items
  from (
    select request.organization_id,
      min(coalesce(nullif(trim(erp.client_name), ''), organization.name)) as customer_name
    from public.translation_requests request
    join public.organizations organization on organization.id = request.organization_id
    left join public.eci_erp_customers erp on erp.auth_user_id = request.requester_id and erp.sync_error is null
    where request.supplier_organization_id = supplier_org_id and request.workflow_stage <> 'draft'
    group by request.organization_id
  ) customer;

  return jsonb_build_object('items', result_items, 'customers', customer_items, 'total_count', total_rows,
    'page', safe_page, 'page_size', requested_size, 'organization_id', supplier_org_id);
end;
$$;

revoke all on function public.get_pm_request_page(text, text, uuid, text, integer, integer) from public, anon;
grant execute on function public.get_pm_request_page(text, text, uuid, text, integer, integer) to authenticated;

create or replace function public.submit_request_from_wizard(
  p_request_id uuid,
  p_requirement jsonb,
  p_config_snapshot jsonb,
  p_file_ids uuid[],
  p_quote jsonb,
  p_finalize boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  requirement_id uuid := gen_random_uuid();
  config_id uuid := gen_random_uuid();
  quote_id uuid := gen_random_uuid();
  quote_version integer;
  quote_row jsonb;
  request_owner uuid;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select request.requester_id into request_owner
  from public.translation_requests request
  where request.id = p_request_id and request.workflow_stage = 'draft'
  for update;
  if request_owner is null or request_owner <> caller_id then
    raise exception 'Draft Request is not editable' using errcode = '42501';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_file_ids, '{}'::uuid[])) file_id
    left join public.request_files file on file.id = file_id and file.request_id = p_request_id
    where file.id is null
  ) then
    raise exception 'One or more Request files are invalid' using errcode = '22023';
  end if;

  delete from public.quote_negotiations where request_id = p_request_id;
  delete from public.quotes where request_id = p_request_id;
  delete from public.request_config_versions where request_id = p_request_id;
  delete from public.translation_requirements where request_id = p_request_id;

  insert into public.translation_requirements (
    id, request_id, source_language, target_language, target_languages,
    scope_type, scope_details, purpose, service_types, ep_service_type_code,
    translation_required, service_item_code, opt_out_country_ids, entity_type,
    filing_type_code, application_type_code, entity_type_code, epv_type_code,
    pct_chapter_code, jurisdiction_codes, ep_country_ids, quality_level,
    delivery_option, due_at, is_urgent, terminology_notes, config_snapshot
  ) values (
    requirement_id, p_request_id,
    nullif(p_requirement->>'source_language', ''),
    nullif(p_requirement->>'target_language', ''),
    array(select jsonb_array_elements_text(coalesce(p_requirement->'target_languages', '[]'::jsonb))),
    'full_text'::public.translation_scope_type,
    coalesce(p_requirement->'scope_details', '{}'::jsonb),
    (p_requirement->>'purpose')::public.translation_purpose,
    array(select jsonb_array_elements_text(p_requirement->'service_types'))::public.translation_service_type[],
    nullif(p_requirement->>'ep_service_type_code', ''),
    coalesce((p_requirement->>'translation_required')::boolean, false),
    nullif(p_requirement->>'service_item_code', ''),
    array(select value::integer from jsonb_array_elements_text(coalesce(p_requirement->'opt_out_country_ids', '[]'::jsonb)) value),
    case when nullif(p_requirement->>'entity_type', '') is null then null else (p_requirement->>'entity_type')::public.patent_entity_type end,
    nullif(p_requirement->>'filing_type_code', ''),
    nullif(p_requirement->>'application_type_code', ''),
    nullif(p_requirement->>'entity_type_code', ''),
    nullif(p_requirement->>'epv_type_code', ''),
    nullif(p_requirement->>'pct_chapter_code', ''),
    array(select jsonb_array_elements_text(coalesce(p_requirement->'jurisdiction_codes', '[]'::jsonb))),
    array(select value::integer from jsonb_array_elements_text(coalesce(p_requirement->'ep_country_ids', '[]'::jsonb)) value),
    (p_requirement->>'quality_level')::public.translation_quality_level,
    'standard'::public.delivery_option,
    nullif(p_requirement->>'due_at', '')::timestamptz,
    coalesce((p_requirement->>'is_urgent')::boolean, false),
    null,
    p_config_snapshot
  );

  insert into public.request_config_versions (
    id, request_id, translation_requirement_id, version_no, config_snapshot, created_by
  ) values (config_id, p_request_id, requirement_id, 1, p_config_snapshot, caller_id);

  insert into public.request_config_files (config_version_id, request_file_id)
  select config_id, file_id from unnest(coalesce(p_file_ids, '{}'::uuid[])) file_id;

  select coalesce(max(quote.version_no), 0) + 1 into quote_version
  from public.quotes quote where quote.request_id = p_request_id;

  insert into public.quotes (
    id, request_id, version_no, status, currency, total_amount,
    estimated_delivery_at, valid_until, notes, pricing_snapshot, breakdown_json
  ) values (
    quote_id, p_request_id, quote_version, 'accepted', p_quote->>'currency',
    (p_quote->>'total')::numeric,
    nullif(p_requirement->>'due_at', '')::timestamptz,
    nullif(p_quote->>'valid_until_timestamp', '')::timestamptz,
    'Generated from a verified signed estimate.',
    jsonb_build_object(
      'source', p_quote->>'source', 'quotedAt', p_quote->>'quotedAt',
      'customerName', p_quote->>'customerName', 'validUntil', p_quote->'validUntil',
      'response', coalesce(p_quote->'rows', '[]'::jsonb)
    ),
    jsonb_build_object(
      'source', p_quote->>'source', 'quotedAt', p_quote->>'quotedAt',
      'customerName', p_quote->>'customerName', 'validUntil', p_quote->'validUntil',
      'response', coalesce(p_quote->'rows', '[]'::jsonb)
    )
  );

  for quote_row in select value from jsonb_array_elements(coalesce(p_quote->'rows', '[]'::jsonb))
  loop
    insert into public.quote_items (quote_id, label, amount, quantity, unit, description)
    values (
      quote_id, quote_row->>'countryName', (quote_row->>'total')::numeric, 1, 'country',
      concat(
        'Official ', coalesce(quote_row->>'officialFee', '0'),
        ' + service ', coalesce(quote_row->>'serviceFee', '0'),
        ' + translation ', coalesce(quote_row->>'translationFee', '0')
      )
    );
  end loop;

  insert into public.quote_factor_snapshots (quote_id, factors)
  values (quote_id, p_quote || jsonb_build_object('amount', (p_quote->>'total')::numeric));

  update public.translation_requests request
  set workflow_stage = case when p_finalize then 'quoted'::public.workflow_stage else 'draft'::public.workflow_stage end,
      requester_status = 'responding', pm_status = 'responding',
      submitted_at = case when p_finalize then now() else null end,
      updated_at = now()
  where request.id = p_request_id;

  if p_finalize then
    insert into public.request_events (request_id, actor_id, event_type, from_status, to_status, payload)
    values (
      p_request_id, caller_id, 'quote.accepted.eci_erp', 'configured', 'quoted',
      jsonb_build_object('quoteId', quote_id, 'amount', (p_quote->>'total')::numeric,
        'currency', p_quote->>'currency', 'source', 'eci_erp')
    );
  end if;

  return jsonb_build_object('quote_id', quote_id, 'requirement_id', requirement_id, 'config_id', config_id);
end;
$$;

revoke all on function public.submit_request_from_wizard(uuid, jsonb, jsonb, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.submit_request_from_wizard(uuid, jsonb, jsonb, uuid[], jsonb, boolean) to authenticated;

create index if not exists translation_requests_requester_active_updated_idx
  on public.translation_requests(requester_id, updated_at desc, id desc)
  where workflow_stage <> 'draft';
create index if not exists translation_requests_requester_draft_updated_idx
  on public.translation_requests(requester_id, updated_at desc, id desc)
  where workflow_stage = 'draft';
create index if not exists translation_requests_supplier_status_updated_idx
  on public.translation_requests(supplier_organization_id, pm_status, updated_at desc, id desc)
  where workflow_stage <> 'draft';
create index if not exists orders_requester_updated_idx
  on public.orders(requester_id, updated_at desc, id desc);
create index if not exists quotes_request_version_desc_idx
  on public.quotes(request_id, version_no desc);
