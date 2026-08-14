create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create type public.organization_relationship_status as enum ('active', 'ended');
create type public.organization_invitation_status as enum (
  'pending',
  'accepted',
  'revoked',
  'expired'
);

alter table public.organizations
  add column code text;

create unique index organizations_code_unique_idx
  on public.organizations(lower(code))
  where code is not null;

alter table public.organization_members
  add column is_org_admin boolean not null default false;

create table public.customer_supplier_relationships (
  id uuid primary key default gen_random_uuid(),
  customer_organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_organization_id uuid not null references public.organizations(id) on delete restrict,
  status public.organization_relationship_status not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_organization_id <> supplier_organization_id),
  check ((status = 'active' and ended_at is null) or status = 'ended')
);

create unique index customer_supplier_one_active_idx
  on public.customer_supplier_relationships(customer_organization_id)
  where status = 'active';
create index customer_supplier_supplier_status_idx
  on public.customer_supplier_relationships(supplier_organization_id, status);

create table public.customer_organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  request_sharing_enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_as_admin boolean not null default false,
  status public.organization_invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(trim(email)))
);

create unique index organization_invitations_one_pending_email_idx
  on public.organization_invitations(organization_id, lower(email))
  where status = 'pending';
create index organization_invitations_email_status_idx
  on public.organization_invitations(lower(email), status, expires_at);

create table public.organization_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_audit_events_org_created_idx
  on public.organization_audit_events(organization_id, created_at desc);

alter table public.translation_requests
  add column supplier_organization_id uuid references public.organizations(id) on delete restrict;

alter table public.pricing_rule_sets
  add column supplier_organization_id uuid references public.organizations(id) on delete restrict;

alter table public.comments
  add column request_id uuid references public.translation_requests(id) on delete cascade;

do $$
declare
  eci_supplier_id uuid;
  operations_count integer;
  moved_staff_count integer := 0;
  bootstrap_admin_id uuid;
begin
  select id
  into eci_supplier_id
  from public.organizations
  where type = 'supplier'
    and lower(coalesce(code, '')) = 'eci'
  limit 1;

  if eci_supplier_id is null then
    select count(*) into operations_count
    from public.organizations
    where type = 'operations';

    if operations_count = 1 then
      update public.organizations
      set type = 'supplier',
          code = 'eci',
          updated_at = now()
      where type = 'operations'
      returning id into eci_supplier_id;
    elsif operations_count = 0 then
      insert into public.organizations (name, type, code)
      values ('ECI', 'supplier', 'eci')
      returning id into eci_supplier_id;
    else
      raise exception 'Expected exactly one operations organization for ECI, found %.', operations_count;
    end if;
  end if;

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    is_org_admin,
    created_at,
    updated_at
  )
  select
    eci_supplier_id,
    legacy_member.user_id,
    legacy_member.role,
    false,
    min(legacy_member.created_at),
    now()
  from public.organization_members legacy_member
  join public.organizations legacy_organization
    on legacy_organization.id = legacy_member.organization_id
  where legacy_organization.type <> 'supplier'
    and legacy_member.role in ('pm', 'ops', 'admin')
  group by legacy_member.user_id, legacy_member.role
  on conflict (organization_id, user_id, role) do nothing;

  delete from public.organization_members legacy_member
  using public.organizations legacy_organization
  where legacy_organization.id = legacy_member.organization_id
    and legacy_organization.type <> 'supplier'
    and legacy_member.role in ('pm', 'ops', 'admin');
  get diagnostics moved_staff_count = row_count;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = eci_supplier_id
      and member.role = 'admin'
  ) then
    select member.id
    into bootstrap_admin_id
    from public.organization_members member
    where member.organization_id = eci_supplier_id
      and member.role in ('pm', 'ops')
    order by member.created_at, member.id
    limit 1;

    if bootstrap_admin_id is not null then
      update public.organization_members
      set role = 'admin', updated_at = now()
      where id = bootstrap_admin_id;
    end if;
  end if;

  if moved_staff_count > 0 or bootstrap_admin_id is not null then
    insert into public.organization_audit_events (
      organization_id,
      event_type,
      payload
    ) values (
      eci_supplier_id,
      'supplier_organization.bootstrap',
      jsonb_build_object(
        'moved_staff_count', moved_staff_count,
        'bootstrap_admin_created', bootstrap_admin_id is not null
      )
    );
  end if;

  insert into public.customer_organization_settings (organization_id, request_sharing_enabled)
  select id, false
  from public.organizations
  where type = 'customer'
  on conflict (organization_id) do nothing;

  insert into public.customer_supplier_relationships (
    customer_organization_id,
    supplier_organization_id,
    status
  )
  select customer.id, eci_supplier_id, 'active'
  from public.organizations customer
  where customer.type = 'customer'
    and not exists (
      select 1
      from public.customer_supplier_relationships relationship
      where relationship.customer_organization_id = customer.id
        and relationship.status = 'active'
    );

  update public.translation_requests request
  set supplier_organization_id = relationship.supplier_organization_id
  from public.customer_supplier_relationships relationship
  where relationship.customer_organization_id = request.organization_id
    and relationship.status = 'active'
    and request.supplier_organization_id is null;

  update public.pricing_rule_sets
  set supplier_organization_id = eci_supplier_id
  where supplier_organization_id is null;
end
$$;

alter table public.translation_requests
  alter column supplier_organization_id set not null;
alter table public.pricing_rule_sets
  alter column supplier_organization_id set not null;

create index translation_requests_supplier_stage_idx
  on public.translation_requests(supplier_organization_id, workflow_stage, updated_at desc);
create index pricing_rule_sets_supplier_active_idx
  on public.pricing_rule_sets(supplier_organization_id, is_active);

update public.comments comment_row
set request_id = comment_row.entity_id
where comment_row.request_id is null
  and comment_row.entity_type in ('request', 'translation_request')
  and exists (
    select 1 from public.translation_requests request where request.id = comment_row.entity_id
  );

update public.comments comment_row
set request_id = orders.request_id
from public.orders orders
where comment_row.request_id is null
  and comment_row.entity_type = 'order'
  and orders.id = comment_row.entity_id;

update public.comments comment_row
set request_id = orders.request_id
from public.translation_tasks task
join public.orders orders on orders.id = task.order_id
where comment_row.request_id is null
  and comment_row.entity_type = 'task'
  and task.id = comment_row.entity_id;

update public.comments comment_row
set request_id = signature_request.request_id
from public.filing_signature_requests signature_request
where comment_row.request_id is null
  and comment_row.entity_type = 'filing_signature_request'
  and signature_request.id = comment_row.entity_id;

create trigger set_customer_supplier_relationships_updated_at
before update on public.customer_supplier_relationships
for each row execute function public.set_updated_at();

create trigger set_customer_organization_settings_updated_at
before update on public.customer_organization_settings
for each row execute function public.set_updated_at();

create trigger set_organization_invitations_updated_at
before update on public.organization_invitations
for each row execute function public.set_updated_at();

create or replace function public.validate_organization_member_role()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_type public.organization_type;
begin
  select type into target_type
  from public.organizations
  where id = new.organization_id;

  if new.role = 'requester' and target_type <> 'customer' then
    raise exception 'Requester members must belong to a customer organization.';
  end if;

  if new.role in ('pm', 'ops', 'admin') and target_type <> 'supplier' then
    raise exception 'PM, operations, and admin members must belong to a supplier organization.';
  end if;

  if new.role = 'translator' and target_type <> 'translator_team' then
    raise exception 'Translator members must belong to a translator team.';
  end if;

  if new.role = 'requester' and exists (
    select 1
    from public.organization_members existing_member
    join public.organizations existing_organization
      on existing_organization.id = existing_member.organization_id
    where existing_member.user_id = new.user_id
      and existing_member.role = 'requester'
      and existing_organization.type = 'customer'
      and existing_member.organization_id <> new.organization_id
  ) then
    raise exception 'A requester cannot belong to more than one customer organization.';
  end if;

  return new;
end;
$$;

create trigger validate_organization_member_role
before insert or update on public.organization_members
for each row execute function public.validate_organization_member_role();
revoke all on function public.validate_organization_member_role()
from public, anon, authenticated;

create or replace function private.is_customer_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_org_id
      and member.user_id = (select auth.uid())
      and member.role = 'requester'
      and organization.type = 'customer'
  );
$$;

create or replace function private.is_customer_admin(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_org_id
      and member.user_id = (select auth.uid())
      and member.role = 'requester'
      and member.is_org_admin
      and organization.type = 'customer'
  );
$$;

create or replace function private.is_supplier_member(
  target_supplier_org_id uuid,
  allowed_roles public.organization_role[] default array['pm', 'ops', 'admin']::public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_supplier_org_id
      and member.user_id = (select auth.uid())
      and member.role = any(allowed_roles)
      and organization.type = 'supplier'
  );
$$;

create or replace function private.is_supplier_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = (select auth.uid())
      and member.role in ('pm', 'ops', 'admin')
      and organization.type = 'supplier'
  );
$$;

create or replace function private.is_supplier_admin_for_customer(target_customer_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = target_customer_org_id
      and relationship.status = 'active'
      and private.is_supplier_member(
        relationship.supplier_organization_id,
        array['admin']::public.organization_role[]
      )
  );
$$;

create or replace function private.can_manage_customer_org(target_customer_org_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_customer_admin(target_customer_org_id)
    or private.is_supplier_admin_for_customer(target_customer_org_id);
$$;

create or replace function private.can_read_organization(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = target_org_id
      and (
        exists (
          select 1 from public.organization_members member
          where member.organization_id = organization.id
            and member.user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.customer_supplier_relationships relationship
          where relationship.status = 'active'
            and (
              relationship.customer_organization_id = organization.id
              and private.is_supplier_member(relationship.supplier_organization_id)
              or relationship.supplier_organization_id = organization.id
              and private.is_customer_member(relationship.customer_organization_id)
            )
        )
      )
  );
$$;

create or replace function private.is_request_owner(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_requests request
    where request.id = target_request_id
      and request.requester_id = (select auth.uid())
  );
$$;

create or replace function private.is_supplier_staff_for_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_requests request
    where request.id = target_request_id
      and request.workflow_stage <> 'draft'
      and private.is_supplier_member(request.supplier_organization_id)
  );
$$;

create or replace function private.can_read_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_requests request
    left join public.customer_organization_settings settings
      on settings.organization_id = request.organization_id
    where request.id = target_request_id
      and (
        request.requester_id = (select auth.uid())
        or (
          request.workflow_stage <> 'draft'
          and private.is_supplier_member(request.supplier_organization_id)
        )
        or (
          request.workflow_stage <> 'draft'
          and coalesce(settings.request_sharing_enabled, false)
          and private.is_customer_member(request.organization_id)
        )
      )
  );
$$;

create or replace function private.can_manage_request(target_request_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_request_owner(target_request_id)
    or private.is_supplier_staff_for_request(target_request_id);
$$;

create or replace function private.can_read_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders orders
    where orders.id = target_order_id
      and (
        private.can_read_request(orders.request_id)
        or exists (
          select 1
          from public.translation_tasks task
          where task.order_id = orders.id
            and task.assigned_translator_id = (select auth.uid())
        )
      )
  );
$$;

create or replace function private.is_translator_for_request(target_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_tasks task
    join public.orders orders on orders.id = task.order_id
    where orders.request_id = target_request_id
      and task.assigned_translator_id = (select auth.uid())
  );
$$;

create or replace function private.can_read_request_file(target_file_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.request_files file
    where file.id = target_file_id
      and (
        private.can_read_request(file.request_id)
        or exists (
          select 1
          from public.translation_tasks task
          join public.orders orders on orders.id = task.order_id
          where orders.request_id = file.request_id
            and task.assigned_translator_id = (select auth.uid())
            and (task.request_file_id is null or task.request_file_id = file.id)
        )
      )
  );
$$;

create or replace function private.can_manage_order(target_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.orders orders
    where orders.id = target_order_id
      and private.is_supplier_staff_for_request(orders.request_id)
  );
$$;

create or replace function private.can_read_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_tasks task
    join public.orders orders on orders.id = task.order_id
    where task.id = target_task_id
      and (
        task.assigned_translator_id = (select auth.uid())
        or private.can_read_request(orders.request_id)
      )
  );
$$;

create or replace function private.can_manage_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.translation_tasks task
    join public.orders orders on orders.id = task.order_id
    where task.id = target_task_id
      and (
        task.assigned_translator_id = (select auth.uid())
        or private.is_supplier_staff_for_request(orders.request_id)
      )
  );
$$;

create or replace function private.can_read_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members target_member
      join public.organization_members current_member
        on current_member.organization_id = target_member.organization_id
      where target_member.user_id = target_user_id
        and current_member.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.organization_members target_member
      join public.customer_supplier_relationships relationship
        on relationship.customer_organization_id = target_member.organization_id
       and relationship.status = 'active'
      where target_member.user_id = target_user_id
        and private.is_supplier_member(relationship.supplier_organization_id)
    );
$$;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated, service_role;

create or replace function public.is_platform_staff()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_supplier_staff();
$$;

create or replace function public.can_access_request(target_request_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_read_request(target_request_id);
$$;

create or replace function public.can_access_order(target_order_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_read_order(target_order_id);
$$;

create or replace function public.can_access_task(target_task_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.can_read_task(target_task_id);
$$;

revoke all on function public.is_platform_staff() from public, anon;
revoke all on function public.can_access_request(uuid) from public, anon;
revoke all on function public.can_access_order(uuid) from public, anon;
revoke all on function public.can_access_task(uuid) from public, anon;
grant execute on function public.is_platform_staff() to authenticated, service_role;
grant execute on function public.can_access_request(uuid) to authenticated, service_role;
grant execute on function public.can_access_order(uuid) to authenticated, service_role;
grant execute on function public.can_access_task(uuid) to authenticated, service_role;

create or replace function public.protect_translation_request_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    new.requester_id is distinct from old.requester_id
    or new.organization_id is distinct from old.organization_id
    or new.supplier_organization_id is distinct from old.supplier_organization_id
    or new.request_no is distinct from old.request_no
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Request ownership and organization fields cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger protect_translation_request_identity
before update on public.translation_requests
for each row execute function public.protect_translation_request_identity();
revoke all on function public.protect_translation_request_identity() from public, anon, authenticated;

create or replace function public.protect_order_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and (
    new.request_id is distinct from old.request_id
    or new.organization_id is distinct from old.organization_id
    or new.requester_id is distinct from old.requester_id
    or new.order_no is distinct from old.order_no
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Order ownership and Request fields cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger protect_order_identity
before update on public.orders
for each row execute function public.protect_order_identity();
revoke all on function public.protect_order_identity() from public, anon, authenticated;

create or replace function public.protect_task_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_id uuid;
begin
  select orders.request_id into request_id
  from public.orders orders
  where orders.id = old.order_id;

  if (select auth.uid()) is not null
    and not private.is_supplier_staff_for_request(request_id)
    and (
      new.order_id is distinct from old.order_id
      or new.assigned_pm_id is distinct from old.assigned_pm_id
      or new.assigned_translator_id is distinct from old.assigned_translator_id
      or new.task_type is distinct from old.task_type
      or new.created_at is distinct from old.created_at
    ) then
    raise exception 'Task assignment fields cannot be changed by the assignee.';
  end if;
  return new;
end;
$$;

create trigger protect_task_identity
before update on public.translation_tasks
for each row execute function public.protect_task_identity();
revoke all on function public.protect_task_identity() from public, anon, authenticated;

create or replace function public.protect_deliverable_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_id uuid;
begin
  select orders.request_id into request_id
  from public.translation_tasks task
  join public.orders orders on orders.id = task.order_id
  where task.id = old.task_id;

  if (select auth.uid()) is not null and (
    new.task_id is distinct from old.task_id
    or new.created_at is distinct from old.created_at
    or (
      new.submitted_by is distinct from old.submitted_by
      and not private.is_supplier_staff_for_request(request_id)
    )
  ) then
    raise exception 'Deliverable ownership fields cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger protect_deliverable_identity
before update on public.task_deliverables
for each row execute function public.protect_deliverable_identity();
revoke all on function public.protect_deliverable_identity() from public, anon, authenticated;

alter table public.customer_supplier_relationships enable row level security;
alter table public.customer_organization_settings enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.organization_audit_events enable row level security;

grant select on public.customer_supplier_relationships to authenticated;
grant select on public.customer_organization_settings to authenticated;
grant select (
  id,
  organization_id,
  email,
  invited_as_admin,
  status,
  invited_by,
  accepted_by,
  expires_at,
  accepted_at,
  revoked_at,
  created_at,
  updated_at
) on public.organization_invitations to authenticated;
grant select on public.organization_audit_events to authenticated;
grant select, insert, update, delete on public.customer_supplier_relationships to service_role;
grant select, insert, update, delete on public.customer_organization_settings to service_role;
grant select, insert, update, delete on public.organization_invitations to service_role;
grant select, insert, update, delete on public.organization_audit_events to service_role;

revoke insert, update, delete on public.organizations from authenticated;
revoke insert, update, delete on public.organization_members from authenticated;

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'profiles', 'organizations', 'organization_members', 'translation_requests',
    'patent_searches', 'patent_candidates', 'patent_file_versions', 'request_files',
    'file_parse_results', 'translation_requirements', 'terminology_glossaries',
    'terminology_entries', 'pricing_rule_sets', 'pricing_rules', 'quotes',
    'quote_negotiations', 'orders', 'translation_tasks', 'task_deliverables',
    'request_events', 'comments', 'notifications', 'file_parse_jobs',
    'request_config_versions', 'request_config_files', 'quote_items',
    'quote_factor_snapshots', 'quote_negotiation_messages', 'request_patents',
    'filing_signature_requests', 'filing_signature_files'
  ]
  loop
    for policy_name in
      select policy.polname
      from pg_policy policy
      join pg_class table_class on table_class.oid = policy.polrelid
      join pg_namespace namespace on namespace.oid = table_class.relnamespace
      where namespace.nspname = 'public'
        and table_class.relname = table_name
    loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
  end loop;
end
$$;

create policy "Profiles follow organization access"
on public.profiles for select to authenticated
using (private.can_read_profile(user_id));
create policy "Profiles can be inserted by owner"
on public.profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "Profiles can be updated by owner"
on public.profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "Organizations follow relationship access"
on public.organizations for select to authenticated
using (private.can_read_organization(id));

create policy "Organization members follow scoped access"
on public.organization_members for select to authenticated
using (
  user_id = (select auth.uid())
  or private.is_customer_member(organization_id)
  or private.is_supplier_member(organization_id)
  or private.is_supplier_admin_for_customer(organization_id)
);

create policy "Customer supplier relationships follow participants"
on public.customer_supplier_relationships for select to authenticated
using (
  private.is_customer_member(customer_organization_id)
  or private.is_supplier_member(supplier_organization_id)
);

create policy "Customer settings follow relationship access"
on public.customer_organization_settings for select to authenticated
using (
  private.is_customer_member(organization_id)
  or exists (
    select 1 from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = organization_id
      and relationship.status = 'active'
      and private.is_supplier_member(relationship.supplier_organization_id)
  )
);

create policy "Organization invitations are visible to managers"
on public.organization_invitations for select to authenticated
using (
  private.can_manage_customer_org(organization_id)
  or lower(email) = lower(coalesce((select auth.jwt() ->> 'email'), ''))
);

create policy "Organization audit events are visible to managers"
on public.organization_audit_events for select to authenticated
using (
  private.can_manage_customer_org(organization_id)
  or private.is_supplier_member(
    organization_id,
    array['admin']::public.organization_role[]
  )
);

create policy "Requests follow scoped read access"
on public.translation_requests for select to authenticated
using (private.can_read_request(id));
create policy "Requesters can create assigned requests"
on public.translation_requests for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and private.is_customer_member(organization_id)
  and exists (
    select 1 from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = organization_id
      and relationship.supplier_organization_id = supplier_organization_id
      and relationship.status = 'active'
  )
);
create policy "Request owners and supplier staff can update requests"
on public.translation_requests for update to authenticated
using (private.can_manage_request(id))
with check (private.can_manage_request(id));

create policy "Patent searches follow request read access"
on public.patent_searches for select to authenticated
using (private.can_read_request(request_id));
create policy "Patent searches follow request manage access"
on public.patent_searches for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Patent candidates follow request read access"
on public.patent_candidates for select to authenticated
using (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_read_request(search.request_id)
));
create policy "Patent candidates follow request manage access"
on public.patent_candidates for all to authenticated
using (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
))
with check (exists (
  select 1 from public.patent_searches search
  where search.id = search_id and private.can_manage_request(search.request_id)
));

create policy "Patent file versions follow request read access"
on public.patent_file_versions for select to authenticated
using (exists (
  select 1
  from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_read_request(search.request_id)
));
create policy "Patent file versions follow request manage access"
on public.patent_file_versions for all to authenticated
using (exists (
  select 1
  from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
))
with check (exists (
  select 1
  from public.patent_candidates candidate
  join public.patent_searches search on search.id = candidate.search_id
  where candidate.id = candidate_id and private.can_manage_request(search.request_id)
));

create policy "Request files follow request read access"
on public.request_files for select to authenticated
using (private.can_read_request_file(id));
create policy "Request files follow request manage access"
on public.request_files for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Parse results follow request read access"
on public.file_parse_results for select to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_read_request_file(file.id)
));
create policy "Parse results follow request manage access"
on public.file_parse_results for all to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
))
with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));

create policy "Parse jobs follow request read access"
on public.file_parse_jobs for select to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_read_request(file.request_id)
));
create policy "Parse jobs follow request manage access"
on public.file_parse_jobs for all to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
))
with check (exists (
  select 1 from public.request_files file
  where file.id = file_id and private.can_manage_request(file.request_id)
));

create policy "Requirements follow request read access"
on public.translation_requirements for select to authenticated
using (private.can_read_request(request_id));
create policy "Requirements follow request manage access"
on public.translation_requirements for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Request patents follow request read access"
on public.request_patents for select to authenticated
using (private.can_read_request(request_id));
create policy "Request patents follow request manage access"
on public.request_patents for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Config versions follow request read access"
on public.request_config_versions for select to authenticated
using (private.can_read_request(request_id));
create policy "Config versions follow request manage access"
on public.request_config_versions for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Config files follow request read access"
on public.request_config_files for select to authenticated
using (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_read_request(config.request_id)
));
create policy "Config files follow request manage access"
on public.request_config_files for all to authenticated
using (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
))
with check (exists (
  select 1 from public.request_config_versions config
  where config.id = config_version_id and private.can_manage_request(config.request_id)
));

create policy "Glossaries follow organization read access"
on public.terminology_glossaries for select to authenticated
using (
  private.is_customer_member(organization_id)
  or private.is_supplier_admin_for_customer(organization_id)
);
create policy "Glossaries are managed by customer admins or supplier admins"
on public.terminology_glossaries for all to authenticated
using (private.can_manage_customer_org(organization_id))
with check (private.can_manage_customer_org(organization_id));

create policy "Terminology entries follow glossary read access"
on public.terminology_entries for select to authenticated
using (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id
    and (
      private.is_customer_member(glossary.organization_id)
      or private.is_supplier_admin_for_customer(glossary.organization_id)
    )
));
create policy "Terminology entries follow glossary manage access"
on public.terminology_entries for all to authenticated
using (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id
    and private.can_manage_customer_org(glossary.organization_id)
))
with check (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id
    and private.can_manage_customer_org(glossary.organization_id)
));

create policy "Pricing rule sets follow supplier access"
on public.pricing_rule_sets for select to authenticated
using (private.is_supplier_member(supplier_organization_id));
create policy "Pricing rule sets are managed by supplier admins"
on public.pricing_rule_sets for all to authenticated
using (private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[]))
with check (private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[]));

create policy "Pricing rules follow supplier rule set access"
on public.pricing_rules for select to authenticated
using (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(rule_set.supplier_organization_id)
));
create policy "Pricing rules are managed by supplier admins"
on public.pricing_rules for all to authenticated
using (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(
      rule_set.supplier_organization_id,
      array['admin']::public.organization_role[]
    )
))
with check (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(
      rule_set.supplier_organization_id,
      array['admin']::public.organization_role[]
    )
));

create policy "Quotes follow request read access"
on public.quotes for select to authenticated
using (private.can_read_request(request_id));
create policy "Quotes follow request manage access"
on public.quotes for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Quote items follow request read access"
on public.quote_items for select to authenticated
using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_read_request(quote.request_id)
));
create policy "Quote items follow request manage access"
on public.quote_items for all to authenticated
using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
))
with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));

create policy "Quote factors follow request read access"
on public.quote_factor_snapshots for select to authenticated
using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_read_request(quote.request_id)
));
create policy "Quote factors follow request manage access"
on public.quote_factor_snapshots for all to authenticated
using (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
))
with check (exists (
  select 1 from public.quotes quote
  where quote.id = quote_id and private.can_manage_request(quote.request_id)
));

create policy "Negotiations follow request read access"
on public.quote_negotiations for select to authenticated
using (private.can_read_request(request_id));
create policy "Negotiations follow request manage access"
on public.quote_negotiations for all to authenticated
using (private.can_manage_request(request_id))
with check (private.can_manage_request(request_id));

create policy "Negotiation messages follow request read access"
on public.quote_negotiation_messages for select to authenticated
using (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id
    and private.can_read_request(negotiation.request_id)
));
create policy "Negotiation messages follow request manage access"
on public.quote_negotiation_messages for all to authenticated
using (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id
    and private.can_manage_request(negotiation.request_id)
))
with check (exists (
  select 1 from public.quote_negotiations negotiation
  where negotiation.id = negotiation_id
    and private.can_manage_request(negotiation.request_id)
));

create policy "Orders follow request read access"
on public.orders for select to authenticated
using (private.can_read_request(request_id));
create policy "Request owners and supplier staff can create orders"
on public.orders for insert to authenticated
with check (
  (
    requester_id = (select auth.uid())
    and private.is_request_owner(request_id)
    and status = 'pending_confirmation'
  )
  or private.is_supplier_staff_for_request(request_id)
);
create policy "Supplier staff can update orders"
on public.orders for update to authenticated
using (private.can_manage_order(id))
with check (private.can_manage_order(id));

create policy "Tasks follow scoped read access"
on public.translation_tasks for select to authenticated
using (private.can_read_task(id));
create policy "Supplier staff can create tasks"
on public.translation_tasks for insert to authenticated
with check (exists (
  select 1 from public.orders orders
  where orders.id = order_id
    and private.is_supplier_staff_for_request(orders.request_id)
));
create policy "Task assignees and supplier staff can update tasks"
on public.translation_tasks for update to authenticated
using (private.can_manage_task(id))
with check (private.can_manage_task(id));

create policy "Deliverables follow task read access"
on public.task_deliverables for select to authenticated
using (private.can_read_task(task_id));
create policy "Task assignees and supplier staff can create deliverables"
on public.task_deliverables for insert to authenticated
with check (
  private.can_manage_task(task_id)
  and submitted_by = (select auth.uid())
);
create policy "Task assignees and supplier staff can update deliverables"
on public.task_deliverables for update to authenticated
using (private.can_manage_task(task_id))
with check (private.can_manage_task(task_id));

create policy "Events follow request access"
on public.request_events for select to authenticated
using (
  (request_id is not null and private.can_read_request(request_id))
  or (order_id is not null and private.can_read_order(order_id))
);
create policy "Participants can append events"
on public.request_events for insert to authenticated
with check (
  actor_id = (select auth.uid())
  and (
    (request_id is not null and private.can_manage_request(request_id))
    or (order_id is not null and private.can_manage_order(order_id))
  )
);

create policy "Comments follow request visibility"
on public.comments for select to authenticated
using (
  request_id is not null
  and (
    (
      private.can_read_request(request_id)
      and (
        visibility in ('requester', 'all')
        or private.is_supplier_staff_for_request(request_id)
      )
    )
    or (
      visibility in ('translator', 'all')
      and private.is_translator_for_request(request_id)
    )
  )
);
create policy "Participants can create comments"
on public.comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and request_id is not null
  and (
    private.can_manage_request(request_id)
    or (
      visibility in ('translator', 'all')
      and private.is_translator_for_request(request_id)
    )
  )
);
create policy "Authors can update comments"
on public.comments for update to authenticated
using (
  author_id = (select auth.uid())
  and request_id is not null
  and (
    private.can_manage_request(request_id)
    or private.is_translator_for_request(request_id)
  )
)
with check (
  author_id = (select auth.uid())
  and request_id is not null
  and (
    private.can_manage_request(request_id)
    or private.is_translator_for_request(request_id)
  )
);

create policy "Notifications are visible to recipient"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));
create policy "Notifications can be updated by recipient"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));
create policy "Supplier staff can create signature notifications"
on public.notifications for insert to authenticated
with check (
  entity_type = 'filing_signature_request'
  and exists (
    select 1 from public.filing_signature_requests signature_request
    where signature_request.id = entity_id
      and signature_request.recipient_id = notifications.recipient_id
      and private.is_supplier_staff_for_request(signature_request.request_id)
  )
);

create policy "Signature requests follow request read access"
on public.filing_signature_requests for select to authenticated
using (private.can_read_request(request_id));
create policy "Supplier staff can create signature requests"
on public.filing_signature_requests for insert to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_supplier_staff_for_request(request_id)
  and exists (
    select 1 from public.translation_requests request
    where request.id = request_id and request.requester_id = recipient_id
  )
);
create policy "Supplier staff can update signature requests"
on public.filing_signature_requests for update to authenticated
using (private.is_supplier_staff_for_request(request_id))
with check (private.is_supplier_staff_for_request(request_id));
create policy "Supplier staff can delete draft signature requests"
on public.filing_signature_requests for delete to authenticated
using (status = 'draft' and private.is_supplier_staff_for_request(request_id));

create policy "Signature files follow request read access"
on public.filing_signature_files for select to authenticated
using (exists (
  select 1 from public.filing_signature_requests signature_request
  where signature_request.id = signature_request_id
    and private.can_read_request(signature_request.request_id)
));
create policy "Signature participants can upload files"
on public.filing_signature_files for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and private.is_supplier_staff_for_request(signature_request.request_id)
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
        )
      )
  )
);
create policy "Signature participants can remove files"
on public.filing_signature_files for delete to authenticated
using (exists (
  select 1 from public.filing_signature_requests signature_request
  where signature_request.id = signature_request_id
    and (
      (
        direction = 'pm_to_requester'
        and signature_request.status = 'draft'
        and private.is_supplier_staff_for_request(signature_request.request_id)
      )
      or (
        direction = 'requester_to_pm'
        and signature_request.status = 'sent'
        and signature_request.recipient_id = (select auth.uid())
        and uploaded_by = (select auth.uid())
      )
    )
));

do $$
declare
  policy_name text;
begin
  foreach policy_name in array array[
    'Request file participants can read',
    'Request file participants can update',
    'PM staff can upload deliverable zips',
    'Task participants can read deliverable zips',
    'Task participants can replace deliverable zips',
    'Task participants can delete deliverable zips',
    'PM staff can delete deliverable zips',
    'Signature participants can upload storage objects',
    'Signature participants can read storage objects',
    'Signature participants can remove storage objects'
  ]
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end
$$;

create policy "Request participants can read request files"
on storage.objects for select to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1 from public.request_files file
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and private.can_read_request_file(file.id)
  )
);

create policy "Request managers can update request files"
on storage.objects for update to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1 from public.request_files file
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and private.can_manage_request(file.request_id)
  )
)
with check (bucket_id = 'request-files');

create policy "Supplier staff can upload deliverables"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'request-files'
  and (storage.foldername(name))[1] = 'deliverables'
  and exists (
    select 1
    from public.orders orders
    where orders.id::text = (storage.foldername(name))[2]
      and private.is_supplier_staff_for_request(orders.request_id)
  )
);

create policy "Task participants can read deliverables"
on storage.objects for select to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1 from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and private.can_read_task(deliverable.task_id)
  )
);

create policy "Task managers can replace deliverables"
on storage.objects for update to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1 from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and private.can_manage_task(deliverable.task_id)
  )
)
with check (bucket_id = 'request-files');

create policy "Task managers can delete deliverables"
on storage.objects for delete to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1 from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and private.can_manage_task(deliverable.task_id)
  )
);

create policy "Signature participants can upload scoped objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'filing-signature-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Signature request readers can read objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'filing-signature-files'
  and exists (
    select 1
    from public.filing_signature_files file
    join public.filing_signature_requests signature_request
      on signature_request.id = file.signature_request_id
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and private.can_read_request(signature_request.request_id)
  )
);

create policy "Signature participants can remove scoped objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'filing-signature-files'
  and exists (
    select 1
    from public.filing_signature_files file
    join public.filing_signature_requests signature_request
      on signature_request.id = file.signature_request_id
    where file.storage_bucket = bucket_id
      and file.storage_path = name
      and (
        (
          file.direction = 'pm_to_requester'
          and signature_request.status = 'draft'
          and private.is_supplier_staff_for_request(signature_request.request_id)
        )
        or (
          file.direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
          and file.uploaded_by = (select auth.uid())
        )
      )
  )
);

drop policy if exists "Public can read todos" on public.todos;
revoke all on public.todos from anon, authenticated;

create or replace function public.admin_set_request_sharing(
  target_organization_id uuid,
  sharing_enabled boolean,
  changed_by_email text,
  change_reason text
)
returns public.customer_organization_settings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_user_id uuid;
  settings public.customer_organization_settings;
begin
  if nullif(trim(change_reason), '') is null then
    raise exception 'A reason is required.';
  end if;

  select actor.id
  into actor_user_id
  from auth.users actor
  join public.organization_members member on member.user_id = actor.id
  join public.customer_supplier_relationships relationship
    on relationship.supplier_organization_id = member.organization_id
   and relationship.customer_organization_id = target_organization_id
   and relationship.status = 'active'
  join public.organizations supplier on supplier.id = member.organization_id
  where lower(actor.email) = lower(trim(changed_by_email))
    and member.role = 'admin'
    and supplier.type = 'supplier'
  limit 1;

  if actor_user_id is null then
    raise exception 'The change actor must be an administrator of the linked supplier.';
  end if;

  insert into public.customer_organization_settings (
    organization_id,
    request_sharing_enabled,
    updated_by
  ) values (
    target_organization_id,
    sharing_enabled,
    actor_user_id
  )
  on conflict (organization_id) do update
  set request_sharing_enabled = excluded.request_sharing_enabled,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning * into settings;

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    target_organization_id,
    actor_user_id,
    'request_sharing.changed',
    jsonb_build_object('enabled', sharing_enabled, 'reason', trim(change_reason))
  );

  return settings;
end;
$$;

revoke all on function public.admin_set_request_sharing(uuid, boolean, text, text)
from public, anon, authenticated;
grant execute on function public.admin_set_request_sharing(uuid, boolean, text, text)
to service_role;

create or replace function public.admin_create_customer_organization(
  organization_name text,
  actor_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  supplier_id uuid;
  customer_id uuid;
begin
  if nullif(trim(organization_name), '') is null then
    raise exception 'Organization name is required.';
  end if;

  select member.organization_id
  into supplier_id
  from public.organization_members member
  join public.organizations supplier on supplier.id = member.organization_id
  where member.user_id = actor_user_id
    and member.role = 'admin'
    and supplier.type = 'supplier'
    and lower(supplier.code) = 'eci'
  limit 1;

  if supplier_id is null then
    raise exception 'Only an ECI supplier administrator can create customer organizations.';
  end if;

  insert into public.organizations (name, type)
  values (trim(organization_name), 'customer')
  returning id into customer_id;

  insert into public.customer_organization_settings (
    organization_id,
    request_sharing_enabled,
    updated_by
  ) values (customer_id, false, actor_user_id);

  insert into public.customer_supplier_relationships (
    customer_organization_id,
    supplier_organization_id,
    status,
    created_by
  ) values (customer_id, supplier_id, 'active', actor_user_id);

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    customer_id,
    actor_user_id,
    'customer_organization.created',
    jsonb_build_object(
      'supplier_organization_id', supplier_id,
      'request_sharing_enabled', false
    )
  );

  return customer_id;
end;
$$;

revoke all on function public.admin_create_customer_organization(text, uuid)
from public, anon, authenticated;
grant execute on function public.admin_create_customer_organization(text, uuid)
to service_role;

create or replace function public.admin_create_organization_invitation(
  target_organization_id uuid,
  target_email text,
  target_token_hash text,
  target_is_admin boolean,
  target_expires_at timestamptz,
  actor_user_id uuid
)
returns public.organization_invitations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  normalized_email text := lower(trim(target_email));
  actor_authorized boolean;
begin
  if normalized_email = '' then
    raise exception 'Invitation email is required.';
  end if;

  if target_expires_at <= now() then
    raise exception 'Invitation expiration must be in the future.';
  end if;

  select (
    exists (
      select 1
      from public.organization_members member
      join public.organizations customer on customer.id = member.organization_id
      where member.user_id = actor_user_id
        and member.organization_id = target_organization_id
        and member.role = 'requester'
        and member.is_org_admin
        and customer.type = 'customer'
    )
    or exists (
      select 1
      from public.organization_members member
      join public.organizations supplier on supplier.id = member.organization_id
      join public.customer_supplier_relationships relationship
        on relationship.supplier_organization_id = supplier.id
       and relationship.customer_organization_id = target_organization_id
       and relationship.status = 'active'
      where member.user_id = actor_user_id
        and member.role = 'admin'
        and supplier.type = 'supplier'
    )
  ) into actor_authorized;

  if not coalesce(actor_authorized, false) then
    raise exception 'You cannot invite members to this organization.';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join public.profiles profile on profile.user_id = member.user_id
    where member.organization_id = target_organization_id
      and lower(profile.email) = normalized_email
  ) then
    raise exception 'This user is already a member of the organization.';
  end if;

  update public.organization_invitations
  set status = 'expired', updated_at = now()
  where organization_id = target_organization_id
    and lower(email) = normalized_email
    and status = 'pending'
    and expires_at <= now();

  insert into public.organization_invitations (
    organization_id,
    email,
    token_hash,
    invited_as_admin,
    invited_by,
    expires_at
  ) values (
    target_organization_id,
    normalized_email,
    target_token_hash,
    target_is_admin,
    actor_user_id,
    target_expires_at
  )
  returning * into invitation;

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    target_organization_id,
    actor_user_id,
    'organization_invitation.created',
    jsonb_build_object(
      'invitation_id', invitation.id,
      'email', normalized_email,
      'invited_as_admin', target_is_admin,
      'expires_at', target_expires_at
    )
  );

  return invitation;
end;
$$;

revoke all on function public.admin_create_organization_invitation(uuid, text, text, boolean, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function public.admin_create_organization_invitation(uuid, text, text, boolean, timestamptz, uuid)
to service_role;

create or replace function public.admin_accept_organization_invitation(
  target_token_hash text,
  target_user_id uuid,
  target_email text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  auth_email text;
begin
  select lower(email)
  into auth_email
  from auth.users
  where id = target_user_id;

  if auth_email is null or auth_email <> lower(trim(target_email)) then
    raise exception 'The authenticated email does not match the invitation.';
  end if;

  select *
  into invitation
  from public.organization_invitations
  where token_hash = target_token_hash
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found.';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'This invitation is no longer available.';
  end if;

  if invitation.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired', updated_at = now()
    where id = invitation.id;
    raise exception 'This invitation has expired.';
  end if;

  if lower(invitation.email) <> auth_email then
    raise exception 'The authenticated email does not match the invitation.';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = target_user_id
      and member.role = 'requester'
      and organization.type = 'customer'
      and member.organization_id <> invitation.organization_id
  ) then
    raise exception 'This account already belongs to another customer organization.';
  end if;

  insert into public.profiles (user_id, email)
  values (target_user_id, auth_email)
  on conflict (user_id) do update
  set email = excluded.email,
      updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    is_org_admin
  ) values (
    invitation.organization_id,
    target_user_id,
    'requester',
    invitation.invited_as_admin
  );

  update public.organization_invitations
  set status = 'accepted',
      accepted_by = target_user_id,
      accepted_at = now(),
      updated_at = now()
  where id = invitation.id;

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    invitation.organization_id,
    target_user_id,
    'organization_invitation.accepted',
    jsonb_build_object('invitation_id', invitation.id, 'email', auth_email)
  );

  return invitation.organization_id;
end;
$$;

revoke all on function public.admin_accept_organization_invitation(text, uuid, text)
from public, anon, authenticated;
grant execute on function public.admin_accept_organization_invitation(text, uuid, text)
to service_role;
