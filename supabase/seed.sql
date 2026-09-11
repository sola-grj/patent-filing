-- Local development identities only. Supabase runs this file after local db reset.
-- Password for every account below: password

do $$
declare
  eci_id uuid;
  baidu_id uuid := '61000000-0000-4000-8000-000000000001';
  company_25462_id uuid := '61000000-0000-4000-8000-000000000002';
  test_patent_id uuid := '61000000-0000-4000-8000-000000000003';
  company_18409_id uuid := '61000000-0000-4000-8000-000000000004';
  client_bbing_id uuid := '61000000-0000-4000-8000-000000000005';
  client_821_id uuid := '61000000-0000-4000-8000-000000000006';
  patent_d1_id uuid := '61000000-0000-4000-8000-000000000007';
  client_827_id uuid := '61000000-0000-4000-8000-000000000008';
  test_ip_id uuid := '61000000-0000-4000-8000-000000000009';
  hku_mba_id uuid := '61000000-0000-4000-8000-000000000010';
  super_admin_id uuid := '62000000-0000-4000-8000-000000000001';
  pm_admin_id uuid := '62000000-0000-4000-8000-000000000002';
  pm_id uuid := '62000000-0000-4000-8000-000000000003';
  baidu_admin_id uuid := '62000000-0000-4000-8000-000000000004';
  baidu_requester_id uuid := '62000000-0000-4000-8000-000000000005';
  erp_20030478_id uuid := '62000000-0000-4000-8000-000000000006';
  erp_20031743_id uuid := '62000000-0000-4000-8000-000000000007';
  erp_20031901_id uuid := '62000000-0000-4000-8000-000000000008';
  erp_20034240_id uuid := '62000000-0000-4000-8000-000000000009';
  erp_20034270_id uuid := '62000000-0000-4000-8000-000000000010';
  erp_20034271_id uuid := '62000000-0000-4000-8000-000000000011';
  erp_20034276_id uuid := '62000000-0000-4000-8000-000000000012';
  erp_20034278_id uuid := '62000000-0000-4000-8000-000000000013';
  erp_20034280_id uuid := '62000000-0000-4000-8000-000000000014';
  erp_20034306_id uuid := '62000000-0000-4000-8000-000000000015';
begin
  select id into eci_id
  from public.organizations
  where type = 'supplier' and lower(code) = 'eci'
  limit 1;

  if eci_id is null then
    raise exception 'The local ECI supplier organization is missing.';
  end if;

  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data
  ) values
    (super_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '1131631886@qq.com', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (pm_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pm-admin@pat.local', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (pm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'pm@pat.local', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (baidu_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '18516920921@163.com', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (baidu_requester_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'garryg@ecinnovations.com', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20030478_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20030478@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20031743_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20031743@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20031901_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20031901@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034240_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034240@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034270_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034270@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034271_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034271@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034276_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034276@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034278_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034278@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034280_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034280@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (erp_20034306_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'erp-client-20034306@login.invalid', extensions.crypt('password', extensions.gen_salt('bf')), now(), now(), now(), '{}', '{}')
  on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = excluded.email_confirmed_at,
      updated_at = now();

  update auth.users
  set confirmation_token = '',
      recovery_token = '',
      email_change_token_new = '',
      email_change = '',
      phone_change = '',
      phone_change_token = '',
      email_change_token_current = '',
      reauthentication_token = '',
      raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
      is_super_admin = false,
      is_sso_user = false,
      is_anonymous = false
  where id = any(array[
    super_admin_id, pm_admin_id, pm_id, baidu_admin_id, baidu_requester_id,
    erp_20030478_id, erp_20031743_id, erp_20031901_id, erp_20034240_id,
    erp_20034270_id, erp_20034271_id, erp_20034276_id, erp_20034278_id,
    erp_20034280_id, erp_20034306_id
  ]);

  insert into auth.identities(
    provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  select user_row.id::text, user_row.id,
    jsonb_build_object('sub', user_row.id::text, 'email', user_row.email),
    'email', now(), now(), now()
  from auth.users user_row
  where user_row.id = any(array[
    super_admin_id, pm_admin_id, pm_id, baidu_admin_id, baidu_requester_id,
    erp_20030478_id, erp_20031743_id, erp_20031901_id, erp_20034240_id,
    erp_20034270_id, erp_20034271_id, erp_20034276_id, erp_20034278_id,
    erp_20034280_id, erp_20034306_id
  ])
  on conflict (provider_id, provider) do update
  set identity_data = excluded.identity_data,
      updated_at = now();

  insert into public.profiles(user_id, email, display_name) values
    (super_admin_id, '1131631886@qq.com', 'Super Admin'),
    (pm_admin_id, 'pm-admin@pat.local', 'PM Admin'),
    (pm_id, 'pm@pat.local', 'PM'),
    (baidu_admin_id, '18516920921@163.com', 'Baidu Requester Admin'),
    (baidu_requester_id, 'garryg@ecinnovations.com', 'Baidu Requester'),
    (erp_20030478_id, 'erp-client-20030478@login.invalid', 'Client20030478'),
    (erp_20031743_id, 'erp-client-20031743@login.invalid', 'Client IP-EPV-Test'),
    (erp_20031901_id, 'erp-client-20031901@login.invalid', 'Client IP'),
    (erp_20034240_id, 'erp-client-20034240@login.invalid', 'BB - Patent'),
    (erp_20034270_id, 'erp-client-20034270@login.invalid', '821专利客户02'),
    (erp_20034271_id, 'erp-client-20034271@login.invalid', '专利客户02'),
    (erp_20034276_id, 'erp-client-20034276@login.invalid', '专利D-1dylyak'),
    (erp_20034278_id, 'erp-client-20034278@login.invalid', '827专利客户01'),
    (erp_20034280_id, 'erp-client-20034280@login.invalid', 'Test IP-USD'),
    (erp_20034306_id, 'erp-client-20034306@login.invalid', 'HKU MBA客户01')
  on conflict (user_id) do update
  set email = excluded.email,
      display_name = excluded.display_name,
      updated_at = now();

  insert into public.organizations(id, name, type, code) values
    (baidu_id, 'Baidu', 'customer', 'local-baidu'),
    (company_25462_id, 'Company25462', 'customer', 'local-company-25462'),
    (test_patent_id, 'Test（专利数据勿动）', 'customer', 'local-patent-test'),
    (company_18409_id, 'Company18409', 'customer', 'local-company-18409'),
    (client_bbing_id, 'Client BBing', 'customer', 'local-client-bbing'),
    (client_821_id, '821专利客户', 'customer', 'local-client-821'),
    (patent_d1_id, '专利D-1', 'customer', 'local-patent-d1'),
    (client_827_id, '827专利客户', 'customer', 'local-client-827'),
    (test_ip_id, 'Test IP', 'customer', 'local-test-ip'),
    (hku_mba_id, 'HKU MBA', 'customer', 'local-hku-mba')
  on conflict (id) do update set name = excluded.name, updated_at = now();

  insert into public.customer_supplier_relationships(
    customer_organization_id, supplier_organization_id, status, created_by
  )
  select customer_id, eci_id, 'active'::public.organization_relationship_status, super_admin_id
  from unnest(array[
    baidu_id, company_25462_id, test_patent_id, company_18409_id, client_bbing_id,
    client_821_id, patent_d1_id, client_827_id, test_ip_id, hku_mba_id
  ]) customer_id
  where not exists (
    select 1 from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = customer_id
      and relationship.supplier_organization_id = eci_id
  );

  insert into public.organization_members(organization_id, user_id, role)
  select membership.organization_id, membership.user_id, membership.role
  from (values
    (eci_id, super_admin_id, 'pm_admin'::public.organization_role),
    (eci_id, pm_admin_id, 'pm_admin'::public.organization_role),
    (eci_id, pm_id, 'pm'::public.organization_role),
    (baidu_id, baidu_admin_id, 'requester_admin'::public.organization_role),
    (baidu_id, baidu_requester_id, 'requester'::public.organization_role),
    (company_25462_id, erp_20030478_id, 'requester'::public.organization_role),
    (test_patent_id, erp_20031743_id, 'requester'::public.organization_role),
    (company_18409_id, erp_20031901_id, 'requester'::public.organization_role),
    (client_bbing_id, erp_20034240_id, 'requester'::public.organization_role),
    (client_821_id, erp_20034270_id, 'requester'::public.organization_role),
    (client_821_id, erp_20034271_id, 'requester'::public.organization_role),
    (patent_d1_id, erp_20034276_id, 'requester'::public.organization_role),
    (client_827_id, erp_20034278_id, 'requester'::public.organization_role),
    (test_ip_id, erp_20034280_id, 'requester'::public.organization_role),
    (hku_mba_id, erp_20034306_id, 'requester'::public.organization_role)
  ) membership(organization_id, user_id, role)
  where not exists (
    select 1 from public.organization_members existing
    where existing.organization_id = membership.organization_id
      and existing.user_id = membership.user_id
  );

  update public.organization_members
  set role = 'requester'::public.organization_role,
      updated_at = now()
  where user_id = any(array[
    erp_20030478_id, erp_20031743_id, erp_20031901_id, erp_20034240_id,
    erp_20034270_id, erp_20034271_id, erp_20034276_id, erp_20034278_id,
    erp_20034280_id, erp_20034306_id
  ]);

  insert into public.eci_erp_customers(
    client_id, client_name, normalized_login, company_name, is_black,
    organization_id, auth_user_id, raw_snapshot, sync_error, last_synced_at
  ) values
    (20030478, 'Client20030478', 'client20030478', 'Company25462', false, company_25462_id, erp_20030478_id, '{}'::jsonb, null, now()),
    (20031743, 'Client IP-EPV-Test', 'client ip-epv-test', 'Test（专利数据勿动）', false, test_patent_id, erp_20031743_id, '{}'::jsonb, null, now()),
    (20031901, 'Client IP', 'client ip', 'Company18409', false, company_18409_id, erp_20031901_id, '{}'::jsonb, null, now()),
    (20034240, 'BB - Patent', 'bb - patent', 'Client BBing', false, client_bbing_id, erp_20034240_id, '{}'::jsonb, null, now()),
    (20034270, '821专利客户02', '821专利客户02', '821专利客户', false, client_821_id, erp_20034270_id, '{}'::jsonb, null, now()),
    (20034271, '专利客户02', '专利客户02', '821专利客户', false, client_821_id, erp_20034271_id, '{}'::jsonb, null, now()),
    (20034276, '专利D-1dylyak', '专利d-1dylyak', '专利D-1', false, patent_d1_id, erp_20034276_id, '{}'::jsonb, null, now()),
    (20034278, '827专利客户01', '827专利客户01', '827专利客户', false, client_827_id, erp_20034278_id, '{}'::jsonb, null, now()),
    (20034280, 'Test IP-USD', 'test ip-usd', 'Test IP', false, test_ip_id, erp_20034280_id, '{}'::jsonb, null, now()),
    (20034306, 'HKU MBA客户01', 'hku mba客户01', 'HKU MBA', false, hku_mba_id, erp_20034306_id, '{}'::jsonb, null, now())
  on conflict (client_id) do update
  set client_name = excluded.client_name,
      normalized_login = excluded.normalized_login,
      company_name = excluded.company_name,
      is_black = excluded.is_black,
      organization_id = excluded.organization_id,
      auth_user_id = excluded.auth_user_id,
      raw_snapshot = excluded.raw_snapshot,
      sync_error = null,
      last_synced_at = now(),
      updated_at = now();
end;
$$;
