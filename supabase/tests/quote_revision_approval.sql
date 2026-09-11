do $$
declare
  customer_id uuid := '10000000-0000-4000-8000-000000000001';
  supplier_id uuid := '10000000-0000-4000-8000-000000000002';
  other_supplier_id uuid := '10000000-0000-4000-8000-000000000003';
  requester_id uuid := '20000000-0000-4000-8000-000000000001';
  pm_id uuid := '20000000-0000-4000-8000-000000000002';
  other_pm_id uuid := '20000000-0000-4000-8000-000000000003';
  admin_id uuid := '20000000-0000-4000-8000-000000000004';
  super_id uuid;
  other_admin_id uuid := '20000000-0000-4000-8000-000000000006';
  request_id uuid := '30000000-0000-4000-8000-000000000001';
  quote_id uuid := '40000000-0000-4000-8000-000000000001';
  approval_id uuid;
  resubmitted_approval_id uuid;
  reopened_approval_id uuid;
  revised_quote_id uuid;
  test_status text;
begin
  select auth_user.id into super_id
  from auth.users auth_user
  join public.profiles profile on profile.user_id = auth_user.id
  where lower(auth_user.email) = '1131631886@qq.com'
    and profile.platform_role = 'super_admin';
  if super_id is null then
    raise exception 'The designated super_admin fixture is missing.';
  end if;

  -- Keep the fixture repeatable even though legacy quote rows are not cascaded
  -- when their Request is removed.
  delete from public.approval_requests where subject_id = quote_id;
  delete from public.quotes where id = quote_id;
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (requester_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-requester@example.com', '', now(), now(), now(), '{}', '{}'),
    (pm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-pm@example.com', '', now(), now(), now(), '{}', '{}'),
    (other_pm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-other-pm@example.com', '', now(), now(), now(), '{}', '{}'),
    (admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-admin@example.com', '', now(), now(), now(), '{}', '{}'),
    (other_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'approval-other-admin@example.com', '', now(), now(), now(), '{}', '{}');
  insert into public.profiles(user_id, email) values
    (requester_id, 'approval-requester@example.com'), (pm_id, 'approval-pm@example.com'),
    (other_pm_id, 'approval-other-pm@example.com'), (admin_id, 'approval-admin@example.com'),
    (other_admin_id, 'approval-other-admin@example.com')
  on conflict (user_id) do update set email = excluded.email;
  if not exists (
    select 1 from public.profiles
    where user_id = super_id and platform_role = 'super_admin'
  ) then
    raise exception 'The designated Auth account was not assigned super_admin.';
  end if;
  begin
    update public.profiles set platform_role = 'super_admin' where user_id = admin_id;
    raise exception 'A non-designated account unexpectedly became super_admin.';
  exception when sqlstate '42501' then null;
  end;
  insert into public.organizations(id, name, type) values
    (customer_id, 'Approval Customer', 'customer'), (supplier_id, 'Approval Supplier', 'supplier'),
    (other_supplier_id, 'Other Supplier', 'supplier');
  insert into public.customer_supplier_relationships(customer_organization_id, supplier_organization_id, status)
  values (customer_id, supplier_id, 'active');
  insert into public.organization_members(organization_id, user_id, role) values
    (customer_id, requester_id, 'requester'), (supplier_id, pm_id, 'pm'),
    (supplier_id, other_pm_id, 'pm'), (supplier_id, admin_id, 'pm_admin'),
    (other_supplier_id, other_admin_id, 'pm_admin');
  insert into public.translation_requests(id, organization_id, supplier_organization_id, requester_id, source_mode, workflow_stage)
  values (request_id, customer_id, supplier_id, requester_id, 'upload', 'quoted');
  insert into public.quotes(id, request_id, version_no, status, currency, total_amount, pricing_snapshot, breakdown_json)
  values (quote_id, request_id, 2, 'draft', 'USD', 120, '{"source":"pm_erp_revision"}', '{"source":"pm_erp_revision"}')
  on conflict (id) do update set request_id = excluded.request_id, status = excluded.status,
    total_amount = excluded.total_amount, pricing_snapshot = excluded.pricing_snapshot,
    breakdown_json = excluded.breakdown_json;

  perform set_config('request.jwt.claim.sub', pm_id::text, true);
  select public.submit_quote_revision_for_approval(quote_id) into approval_id;
  begin
    perform public.submit_quote_revision_for_approval(quote_id);
    raise exception 'Duplicate pending approval unexpectedly succeeded.';
  exception when unique_violation then null;
  end;
  select workflow_stage::text into test_status from public.translation_requests where id = request_id;
  if test_status <> 'quoted' then raise exception 'Submit changed lifecycle before customer send.'; end if;
  begin
    perform public.send_pm_quote_revision(quote_id);
    raise exception 'Send before approval unexpectedly succeeded.';
  exception when sqlstate '55000' then null;
  end;
  begin
    update public.quotes set total_amount = 121 where id = quote_id;
    raise exception 'Locked quotation update unexpectedly succeeded.';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.create_pm_quote_revision(
      request_id,
      'USD',
      121,
      null,
      'pending edit',
      '{"source":"pm_erp_revision"}',
      '{"source":"pm_erp_revision"}',
      '{}',
      '[]'
    );
    raise exception 'A pending quotation was unexpectedly reopened.';
  exception when sqlstate '55000' then null;
  end;

  begin
    perform public.review_quote_revision_approval(approval_id, 'approved', null);
    raise exception 'An ordinary PM unexpectedly reviewed an approval.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', other_admin_id::text, true);
  begin
    perform public.review_quote_revision_approval(approval_id, 'approved', null);
    raise exception 'A cross-supplier PM administrator unexpectedly reviewed an approval.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform public.review_quote_revision_approval(approval_id, 'rejected', 'Pricing evidence required.');
  select workflow_stage::text into test_status from public.translation_requests where id = request_id;
  if test_status <> 'quoted' then raise exception 'Rejection changed lifecycle before customer send.'; end if;
  begin
    perform public.create_pm_quote_revision(request_id, 'USD', 125, null, 'admin edit', '{}', '{}', '{}', '[]');
    raise exception 'PM administrator revision unexpectedly succeeded.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', pm_id::text, true);
  update public.quotes set total_amount = 122 where id = quote_id;
  select public.submit_quote_revision_for_approval(quote_id) into resubmitted_approval_id;
  if resubmitted_approval_id = approval_id then raise exception 'Resubmission did not create approval history.'; end if;

  perform set_config('request.jwt.claim.sub', super_id::text, true);
  perform public.review_quote_revision_approval(resubmitted_approval_id, 'approved', null);
  select workflow_stage::text into test_status from public.translation_requests where id = request_id;
  if test_status <> 'quoted' then raise exception 'Approval changed lifecycle before customer send.'; end if;
  begin
    update public.quotes set total_amount = 123 where id = quote_id;
    raise exception 'Approved quotation update unexpectedly succeeded.';
  exception when sqlstate '55000' then null;
  end;

  perform set_config('request.jwt.claim.sub', pm_id::text, true);
  select public.create_pm_quote_revision(
    request_id,
    'USD',
    123,
    null,
    'approved revision reopened',
    '{"source":"pm_erp_revision"}',
    '{"source":"pm_erp_revision"}',
    '{}',
    '[]'
  ) into revised_quote_id;
  if revised_quote_id <> quote_id then
    raise exception 'Editing before customer send unexpectedly created a new quotation version.';
  end if;
  if not exists (select 1 from public.quotes where id = quote_id and version_no = 2 and status = 'draft') then
    raise exception 'Editing before customer send changed the draft version number.';
  end if;
  if not exists (select 1 from public.approval_requests where id = resubmitted_approval_id and status = 'cancelled') then
    raise exception 'The prior approval was not cancelled when the approved quotation was edited.';
  end if;
  select public.submit_quote_revision_for_approval(quote_id) into reopened_approval_id;

  perform set_config('request.jwt.claim.sub', super_id::text, true);
  perform public.review_quote_revision_approval(reopened_approval_id, 'approved', null);

  perform set_config('request.jwt.claim.sub', other_pm_id::text, true);
  begin
    perform public.send_pm_quote_revision(quote_id);
    raise exception 'A different PM unexpectedly sent the approved quotation.';
  exception when sqlstate '42501' then null;
  end;

  perform set_config('request.jwt.claim.sub', pm_id::text, true);
  begin
    update public.quotes set status = 'sent' where id = quote_id;
    raise exception 'Direct quotation send unexpectedly bypassed the atomic RPC.';
  exception when sqlstate '55000' then null;
  end;
  perform public.send_pm_quote_revision(quote_id);
  select workflow_stage::text into test_status from public.translation_requests where id = request_id;
  if test_status <> 'negotiation' then raise exception 'Customer send did not enter negotiation.'; end if;
  if not exists (select 1 from public.approval_requests where id = reopened_approval_id and sent_at is not null) then
    raise exception 'Approval was not marked sent.';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.approval_requests where subject_id = quote_id;
  delete from public.quotes where id = quote_id;
  delete from public.translation_requests where id = request_id;
  delete from public.customer_supplier_relationships where customer_organization_id = customer_id;
  delete from public.organizations where id in (customer_id, supplier_id, other_supplier_id);
  delete from auth.users where id in (requester_id, pm_id, other_pm_id, admin_id, other_admin_id);
end;
$$;
