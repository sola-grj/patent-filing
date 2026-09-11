-- Replace legacy business identities and add an auditable quotation revision approval flow.

do $$
declare
  super_admin_count integer;
  auth_user_count integer;
begin
  if exists (select 1 from public.organization_members where role = 'translator') then
    raise exception 'Role migration blocked: translator memberships still exist.';
  end if;
  if exists (select 1 from public.organizations where type = 'translator_team') then
    raise exception 'Role migration blocked: translator-team organizations still exist.';
  end if;
  if exists (select 1 from public.translation_tasks where assigned_translator_id is not null) then
    raise exception 'Role migration blocked: translation tasks still have translator assignments.';
  end if;
  if exists (select 1 from public.comments where visibility = 'translator') then
    raise exception 'Role migration blocked: translator-only comments still exist.';
  end if;
  if exists (select 1 from public.organizations where type = 'operations') then
    raise exception 'Role migration blocked: operations organizations still exist.';
  end if;

  select count(*) into super_admin_count
  from auth.users
  where lower(email) = '1131631886@qq.com';
  select count(*) into auth_user_count from auth.users;
  if auth_user_count > 0 and super_admin_count <> 1 then
    raise exception 'Role migration requires exactly one auth user for 1131631886@qq.com; found %.', super_admin_count;
  end if;
end;
$$;

create type public.platform_role as enum ('super_admin');
alter table public.profiles add column platform_role public.platform_role;
create unique index profiles_single_super_admin_idx
on public.profiles(platform_role) where platform_role = 'super_admin';

insert into public.profiles (user_id, email, platform_role)
select id, email, 'super_admin'::public.platform_role
from auth.users
where lower(email) = '1131631886@qq.com'
on conflict (user_id) do update
set platform_role = excluded.platform_role,
    updated_at = now();

create or replace function public.sync_designated_super_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email, '')) = '1131631886@qq.com' then
    insert into public.profiles(user_id, email, platform_role)
    values (new.id, new.email, 'super_admin')
    on conflict (user_id) do update set platform_role = 'super_admin', updated_at = now();
  elsif tg_op = 'UPDATE' and lower(coalesce(old.email, '')) = '1131631886@qq.com' then
    update public.profiles set platform_role = null, updated_at = now() where user_id = old.id;
  end if;
  return new;
end;
$$;
create trigger sync_designated_super_admin
after insert or update of email on auth.users
for each row execute function public.sync_designated_super_admin();
revoke all on function public.sync_designated_super_admin() from public, anon, authenticated;

create or replace function public.protect_designated_super_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  auth_email text;
begin
  select lower(email) into auth_email from auth.users where id = new.user_id;
  if new.platform_role = 'super_admin' and auth_email is distinct from '1131631886@qq.com' then
    raise exception 'super_admin is reserved for the designated platform account.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and old.platform_role = 'super_admin'
     and new.platform_role is distinct from old.platform_role
     and auth_email = '1131631886@qq.com' then
    raise exception 'The designated platform account must remain super_admin.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger protect_designated_super_admin
before insert or update of platform_role on public.profiles
for each row execute function public.protect_designated_super_admin();
revoke all on function public.protect_designated_super_admin() from public, anon, authenticated;

-- Keep the old enum only for legacy function signatures. The active membership
-- column uses the clean four-value enum below.
alter type public.organization_role rename to organization_role_legacy;
create type public.organization_role as enum ('requester', 'requester_admin', 'pm', 'pm_admin');

delete from public.organization_members legacy
using public.organization_members canonical
where legacy.organization_id = canonical.organization_id
  and legacy.user_id = canonical.user_id
  and legacy.role = 'ops'
  and canonical.role = 'pm';

alter table public.organization_members
alter column role type public.organization_role
using (
  case
    when role::text = 'requester' and is_org_admin then 'requester_admin'
    when role::text = 'requester' then 'requester'
    when role::text in ('pm', 'ops') then 'pm'
    when role::text = 'admin' then 'pm_admin'
    else null
  end
)::public.organization_role;

alter table public.organization_invitations
add column invited_role public.organization_role;
update public.organization_invitations
set invited_role = case when invited_as_admin then 'requester_admin' else 'requester' end::public.organization_role;
alter table public.organization_invitations alter column invited_role set not null;

create or replace function private.is_super_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles profile
    where profile.user_id = (select auth.uid())
      and profile.platform_role = 'super_admin'
  );
$$;

create or replace function private.is_customer_member(target_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_org_id
      and member.user_id = (select auth.uid())
      and member.role in ('requester', 'requester_admin')
      and organization.type = 'customer'
  );
$$;

create or replace function private.is_customer_admin(target_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_org_id
      and member.user_id = (select auth.uid())
      and member.role = 'requester_admin'
      and organization.type = 'customer'
  );
$$;

-- Preserve the legacy signature because existing policies depend on its OID.
create or replace function private.is_supplier_member(
  target_supplier_org_id uuid,
  allowed_roles public.organization_role_legacy[] default array['pm', 'ops', 'admin']::public.organization_role_legacy[]
)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_supplier_org_id
      and member.user_id = (select auth.uid())
      and organization.type = 'supplier'
      and (
        member.role = 'pm_admin'
          and ('admin' = any(allowed_roles::text[]) or 'pm_admin' = any(allowed_roles::text[]))
        or member.role = 'pm'
          and ('pm' = any(allowed_roles::text[]) or 'ops' = any(allowed_roles::text[]))
      )
  );
$$;

create or replace function private.is_supplier_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = (select auth.uid())
      and member.role in ('pm', 'pm_admin')
      and organization.type = 'supplier'
  );
$$;

create or replace function private.is_supplier_admin_for_customer(target_customer_org_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_super_admin() or exists (
    select 1
    from public.customer_supplier_relationships relationship
    join public.organization_members member
      on member.organization_id = relationship.supplier_organization_id
    where relationship.customer_organization_id = target_customer_org_id
      and relationship.status = 'active'
      and member.user_id = (select auth.uid())
      and member.role = 'pm_admin'
  );
$$;

create or replace function public.validate_organization_member_role()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_type public.organization_type;
begin
  select type into target_type from public.organizations where id = new.organization_id;
  if new.role in ('requester', 'requester_admin') and target_type <> 'customer' then
    raise exception 'Requester members must belong to a customer organization.';
  end if;
  if new.role in ('pm', 'pm_admin') and target_type <> 'supplier' then
    raise exception 'PM members must belong to a supplier organization.';
  end if;
  if new.role in ('requester', 'requester_admin') and exists (
    select 1 from public.organization_members existing_member
    join public.organizations existing_org on existing_org.id = existing_member.organization_id
    where existing_member.user_id = new.user_id
      and existing_member.role in ('requester', 'requester_admin')
      and existing_org.type = 'customer'
      and existing_member.organization_id <> new.organization_id
  ) then
    raise exception 'A requester cannot belong to more than one customer organization.';
  end if;
  return new;
end;
$$;

create or replace function public.get_portal_context()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); result jsonb;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select jsonb_build_object(
    'user_id', caller_id,
    'effective_role', case
      when profile.platform_role = 'super_admin' then 'super_admin'
      when exists (select 1 from public.organization_members m where m.user_id = caller_id and m.role = 'pm_admin') then 'pm_admin'
      when exists (select 1 from public.organization_members m where m.user_id = caller_id and m.role = 'pm') then 'pm'
      when exists (select 1 from public.organization_members m where m.user_id = caller_id and m.role = 'requester_admin') then 'requester_admin'
      else 'requester'
    end,
    'profile', jsonb_build_object(
      'display_name', profile.display_name,
      'email', profile.email,
      'password_setup_required', profile.password_setup_required,
      'platform_role', profile.platform_role
    ),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', member.id, 'organization_id', member.organization_id, 'role', member.role,
        'organization', jsonb_build_object('id', organization.id, 'name', organization.name, 'type', organization.type),
        'supplier_organization_id', relationship.supplier_organization_id,
        'request_sharing_enabled', coalesce(settings.request_sharing_enabled, false)
      ) order by member.created_at, member.id)
      from public.organization_members member
      join public.organizations organization on organization.id = member.organization_id
      left join public.customer_supplier_relationships relationship
        on relationship.customer_organization_id = member.organization_id and relationship.status = 'active'
      left join public.customer_organization_settings settings on settings.organization_id = member.organization_id
      where member.user_id = caller_id
    ), '[]'::jsonb),
    'unread_count', (select count(*) from public.notifications n where n.recipient_id = caller_id and n.read_at is null)
  ) into result
  from public.profiles profile where profile.user_id = caller_id;
  return coalesce(result, jsonb_build_object('user_id', caller_id, 'memberships', '[]'::jsonb, 'unread_count', 0));
end;
$$;

alter table public.organization_members drop column is_org_admin;

-- Remove the Translator-facing authorization surface before dropping the column.
create or replace function private.can_read_order(target_order_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders orders where orders.id = target_order_id and private.can_read_request(orders.request_id));
$$;
create or replace function private.can_read_request_file(target_file_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.request_files file where file.id = target_file_id and private.can_read_request(file.request_id));
$$;
create or replace function private.can_read_task(target_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.translation_tasks task join public.orders orders on orders.id = task.order_id
    where task.id = target_task_id and private.can_read_request(orders.request_id)
  );
$$;
create or replace function private.can_manage_task(target_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.translation_tasks task join public.orders orders on orders.id = task.order_id
    where task.id = target_task_id and private.is_supplier_staff_for_request(orders.request_id)
  );
$$;
create or replace function public.protect_task_identity()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare request_id uuid;
begin
  select orders.request_id into request_id from public.orders orders where orders.id = old.order_id;
  if (select auth.uid()) is not null and not private.is_supplier_staff_for_request(request_id) and (
    new.order_id is distinct from old.order_id or new.assigned_pm_id is distinct from old.assigned_pm_id
    or new.task_type is distinct from old.task_type or new.created_at is distinct from old.created_at
  ) then raise exception 'Task assignment fields cannot be changed.'; end if;
  return new;
end;
$$;

drop policy if exists "Request files follow scoped read access" on public.request_files;
drop policy if exists "Request files follow request read access" on public.request_files;
create policy "Request files follow request read access" on public.request_files for select to authenticated
using (private.can_read_request(request_id));
drop policy if exists "Parse results follow request read access" on public.file_parse_results;
create policy "Parse results follow request read access" on public.file_parse_results for select to authenticated
using (exists (
  select 1 from public.request_files file
  where file.id = file_parse_results.file_id and private.can_read_request(file.request_id)
));

drop policy if exists "Comments follow request visibility" on public.comments;
drop policy if exists "Participants can create comments" on public.comments;
drop policy if exists "Authors can update comments" on public.comments;
alter type public.comment_visibility rename to comment_visibility_legacy;
create type public.comment_visibility as enum ('internal', 'requester', 'all');
alter table public.comments alter column visibility drop default;
alter table public.comments alter column visibility type public.comment_visibility using visibility::text::public.comment_visibility;
alter table public.comments alter column visibility set default 'all';
create policy "Comments follow request visibility" on public.comments for select to authenticated
using (request_id is not null and private.can_read_request(request_id)
  and (visibility in ('requester', 'all') or private.is_supplier_staff_for_request(request_id)));
create policy "Participants can create comments" on public.comments for insert to authenticated
with check (author_id = (select auth.uid()) and request_id is not null and private.can_manage_request(request_id));
create policy "Authors can update comments" on public.comments for update to authenticated
using (author_id = (select auth.uid()) and request_id is not null and private.can_manage_request(request_id))
with check (author_id = (select auth.uid()) and request_id is not null and private.can_manage_request(request_id));
drop function if exists private.is_translator_for_request(uuid);

drop function if exists public.get_order_assignment_contacts(uuid);
alter table public.translation_tasks drop column assigned_translator_id;

create or replace function public.get_order_assignment_contacts(target_order_id uuid)
returns table (pm_names text)
language sql stable security definer set search_path = '' as $$
  select string_agg(
    distinct coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_pm_id::text), ', '
    order by coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_pm_id::text)
  )
  from public.orders ord
  left join public.translation_tasks task on task.order_id = ord.id and task.assigned_pm_id is not null
  left join public.profiles profile on profile.user_id = task.assigned_pm_id
  where ord.id = target_order_id and (select auth.uid()) is not null and public.can_access_order(ord.id);
$$;
revoke all on function public.get_order_assignment_contacts(uuid) from public, anon;
grant execute on function public.get_order_assignment_contacts(uuid) to authenticated;

alter type public.organization_type rename to organization_type_legacy;
create type public.organization_type as enum ('customer', 'supplier');
alter table public.organizations alter column type drop default;
alter table public.organizations alter column type type public.organization_type using type::text::public.organization_type;
alter table public.organizations alter column type set default 'customer';

create type public.approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  approval_type text not null check (approval_type = 'quote_revision'),
  supplier_organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.translation_requests(id) on delete cascade,
  subject_id uuid not null references public.quotes(id) on delete cascade,
  status public.approval_status not null default 'pending',
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  decision_reason text,
  payload_snapshot jsonb not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index approval_requests_active_subject_idx on public.approval_requests(approval_type, subject_id)
where status in ('pending', 'approved') and sent_at is null;
create index approval_requests_supplier_status_idx
on public.approval_requests(supplier_organization_id, status, submitted_at desc);
create trigger set_approval_requests_updated_at before update on public.approval_requests
for each row execute function public.set_updated_at();
alter table public.approval_requests enable row level security;
grant select on public.approval_requests to authenticated;
grant select, insert, update, delete on public.approval_requests to service_role;
create policy "Approvals follow supplier scope" on public.approval_requests for select to authenticated
using (
  private.is_super_admin()
  or submitted_by = (select auth.uid())
  or private.is_supplier_member(supplier_organization_id)
);

create or replace function private.current_supplier_role(target_supplier_id uuid, target_role public.organization_role)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_supplier_id and member.user_id = (select auth.uid())
      and member.role = target_role and organization.type = 'supplier'
  );
$$;

create or replace function private.quote_revision_payload(target_quote_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'quote', to_jsonb(quote),
    'source_quote', (
      select to_jsonb(source_quote) from public.quotes source_quote
      where source_quote.id = case
        when coalesce(quote.breakdown_json #>> '{revision,sourceQuoteId}', quote.pricing_snapshot #>> '{revision,sourceQuoteId}', '')
          ~* '^[0-9a-f-]{36}$'
        then coalesce(quote.breakdown_json #>> '{revision,sourceQuoteId}', quote.pricing_snapshot #>> '{revision,sourceQuoteId}')::uuid
        else null
      end
    ),
    'items', coalesce((select jsonb_agg(to_jsonb(item) order by item.created_at, item.id) from public.quote_items item where item.quote_id = quote.id), '[]'::jsonb),
    'factors', coalesce((select jsonb_agg(to_jsonb(factor) order by factor.created_at, factor.id) from public.quote_factor_snapshots factor where factor.quote_id = quote.id), '[]'::jsonb)
  ) from public.quotes quote where quote.id = target_quote_id;
$$;

create or replace function public.submit_quote_revision_for_approval(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); quote_row public.quotes; request_row public.translation_requests; approval_id uuid;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into quote_row from public.quotes where id = p_quote_id for update;
  if not found or quote_row.status <> 'draft' then raise exception 'A saved draft quotation is required.' using errcode = '22023'; end if;
  select * into request_row from public.translation_requests where id = quote_row.request_id for update;
  if not private.current_supplier_role(request_row.supplier_organization_id, 'pm') then
    raise exception 'Only a PM can submit quotation changes.' using errcode = '42501';
  end if;
  if coalesce(quote_row.breakdown_json->>'source', quote_row.pricing_snapshot->>'source') <> 'pm_erp_revision' then
    raise exception 'Only PM quotation revisions require approval.' using errcode = '22023';
  end if;
  insert into public.approval_requests (
    approval_type, supplier_organization_id, request_id, subject_id, submitted_by, payload_snapshot
  ) values (
    'quote_revision', request_row.supplier_organization_id, request_row.id, quote_row.id, caller_id,
    private.quote_revision_payload(quote_row.id)
  ) returning id into approval_id;
  insert into public.request_events(request_id, actor_id, event_type, from_status, to_status, payload)
  values (request_row.id, caller_id, 'quote_revision.submitted', request_row.workflow_stage::text,
    request_row.workflow_stage::text, jsonb_build_object('approvalId', approval_id, 'quoteId', quote_row.id));
  insert into public.notifications(recipient_id, type, entity_type, entity_id, payload, dedupe_key)
  select distinct recipient.user_id, 'pm_quote_revision_approval_requested', 'approval_request', approval_id,
    jsonb_build_object('approvalId', approval_id, 'requestId', request_row.id, 'requestNo', request_row.request_no,
      'quoteId', quote_row.id, 'href', '/pm/approvals'),
    'quote-revision-approval:submitted:' || approval_id::text || ':' || recipient.user_id::text
  from (
    select member.user_id from public.organization_members member
    where member.organization_id = request_row.supplier_organization_id and member.role = 'pm_admin'
    union
    select profile.user_id from public.profiles profile where profile.platform_role = 'super_admin'
  ) recipient
  on conflict (recipient_id, dedupe_key) do nothing;
  return approval_id;
end;
$$;

create or replace function public.review_quote_revision_approval(
  p_approval_id uuid, p_decision text, p_reason text default null
)
returns public.approval_requests language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); approval public.approval_requests; request_row public.translation_requests;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected.' using errcode = '22023'; end if;
  if p_decision = 'rejected' and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  select * into approval from public.approval_requests where id = p_approval_id for update;
  if not found then raise exception 'Approval request not found.' using errcode = 'P0002'; end if;
  if approval.status <> 'pending' then raise exception 'This approval has already been reviewed.' using errcode = '55000'; end if;
  if not (private.is_super_admin() or private.current_supplier_role(approval.supplier_organization_id, 'pm_admin')) then
    raise exception 'PM administrator access required.' using errcode = '42501';
  end if;
  if private.quote_revision_payload(approval.subject_id) is distinct from approval.payload_snapshot then
    raise exception 'The quotation changed after submission.' using errcode = '55000';
  end if;
  update public.approval_requests set status = p_decision::public.approval_status,
    reviewed_by = caller_id, reviewed_at = now(), decision_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = approval.id returning * into approval;
  select * into request_row from public.translation_requests where id = approval.request_id;
  insert into public.request_events(request_id, actor_id, event_type, from_status, to_status, payload)
  values (approval.request_id, caller_id, 'quote_revision.' || p_decision,
    request_row.workflow_stage::text, request_row.workflow_stage::text,
    jsonb_build_object('approvalId', approval.id, 'quoteId', approval.subject_id, 'reason', approval.decision_reason));
  insert into public.notifications(recipient_id, type, entity_type, entity_id, payload, dedupe_key)
  values (approval.submitted_by, 'pm_quote_revision_' || p_decision, 'approval_request', approval.id,
    jsonb_build_object('approvalId', approval.id, 'requestId', approval.request_id, 'requestNo', request_row.request_no,
      'quoteId', approval.subject_id, 'reason', approval.decision_reason, 'href', '/pm/' || approval.request_id::text),
    'quote-revision-approval:' || p_decision || ':' || approval.id::text);
  return approval;
end;
$$;

create or replace function public.protect_approved_quote_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare approval public.approval_requests;
begin
  select * into approval from public.approval_requests
  where approval_type = 'quote_revision' and subject_id = old.id
    and status in ('pending', 'approved') and sent_at is null limit 1;
  if approval.id is null then return new; end if;
  if old.status = 'draft' and new.status = 'sent' and approval.status = 'approved'
    and approval.submitted_by = (select auth.uid())
    and current_setting('app.quote_revision_send_approval_id', true) = approval.id::text
  then return new; end if;
  if new is distinct from old then raise exception 'This quotation is locked by approval workflow.' using errcode = '55000'; end if;
  return new;
end;
$$;
create trigger protect_approved_quote_revision before update or delete on public.quotes
for each row execute function public.protect_approved_quote_revision();

create or replace function public.protect_approved_quote_revision_child()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_quote_id uuid := coalesce(new.quote_id, old.quote_id);
begin
  if exists (select 1 from public.approval_requests approval where approval.approval_type = 'quote_revision'
    and approval.subject_id = target_quote_id and approval.status in ('pending', 'approved') and approval.sent_at is null)
  then raise exception 'This quotation is locked by approval workflow.' using errcode = '55000'; end if;
  return coalesce(new, old);
end;
$$;
create trigger protect_approved_quote_items before insert or update or delete on public.quote_items
for each row execute function public.protect_approved_quote_revision_child();
create trigger protect_approved_quote_factors before insert or update or delete on public.quote_factor_snapshots
for each row execute function public.protect_approved_quote_revision_child();

revoke all on function private.is_super_admin() from public, anon;
revoke all on function private.current_supplier_role(uuid, public.organization_role) from public, anon;
revoke all on function private.quote_revision_payload(uuid) from public, anon, authenticated;
grant execute on function private.is_super_admin() to authenticated, service_role;
grant execute on function private.current_supplier_role(uuid, public.organization_role) to authenticated, service_role;
revoke all on function public.submit_quote_revision_for_approval(uuid) from public, anon;
revoke all on function public.review_quote_revision_approval(uuid, text, text) from public, anon;
grant execute on function public.submit_quote_revision_for_approval(uuid) to authenticated;
grant execute on function public.review_quote_revision_approval(uuid, text, text) to authenticated;

-- The profile owner may not promote themselves to the global platform role.
revoke update on public.profiles from authenticated;
revoke insert on public.profiles from authenticated;
grant update (display_name, email, phone, default_language, metadata, password_setup_required, updated_at)
on public.profiles to authenticated;
grant insert (user_id, display_name, email, phone, default_language, metadata, created_at, updated_at, password_setup_required)
on public.profiles to authenticated;

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
    if exists (select 1 from public.approval_requests where subject_id = v_quote_id
      and status in ('pending', 'approved') and sent_at is null) then
      raise exception 'This quotation is locked by approval workflow.' using errcode = '55000';
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

create or replace function public.send_pm_quote_revision(p_quote_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  v_quote public.quotes%rowtype;
  v_request public.translation_requests%rowtype;
  v_approval public.approval_requests%rowtype;
  v_matter text;
begin
  if caller_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quotation not found.' using errcode = 'P0002'; end if;
  if v_quote.status <> 'draft' then raise exception 'Only a saved draft quotation can be sent.' using errcode = '22023'; end if;
  select * into v_request from public.translation_requests where id = v_quote.request_id for update;
  if not private.current_supplier_role(v_request.supplier_organization_id, 'pm') then
    raise exception 'Only a PM can send quotation changes.' using errcode = '42501';
  end if;
  select * into v_approval from public.approval_requests
  where approval_type = 'quote_revision' and subject_id = v_quote.id and status = 'approved' and sent_at is null
  order by submitted_at desc limit 1 for update;
  if not found then raise exception 'This quotation must be approved before it can be sent.' using errcode = '55000'; end if;
  if v_approval.submitted_by <> caller_id then raise exception 'Only the submitting PM can send this quotation.' using errcode = '42501'; end if;
  if private.quote_revision_payload(v_quote.id) is distinct from v_approval.payload_snapshot then
    raise exception 'The approved quotation has changed.' using errcode = '55000';
  end if;
  if exists (select 1 from public.quotes where request_id = v_request.id and status = 'sent') then
    raise exception 'A quotation is already waiting for customer confirmation.' using errcode = '55000';
  end if;
  perform set_config('app.quote_revision_send_approval_id', v_approval.id::text, true);
  update public.quotes set status = 'sent' where id = v_quote.id;
  perform set_config('app.quote_revision_send_approval_id', '', true);
  update public.approval_requests set sent_at = now() where id = v_approval.id;
  update public.translation_requests set workflow_stage = 'negotiation', requester_status = 'negotiation', pm_status = 'negotiation'
  where id = v_request.id;
  select coalesce(patent.patent_number, v_request.title, v_request.request_no) into v_matter
  from public.request_patents patent where patent.request_id = v_request.id limit 1;
  perform private.create_quote_confirmation_notification(
    v_quote.id, v_request.requester_id,
    jsonb_build_object('requestId', v_request.id, 'requestNo', v_request.request_no,
      'matter', coalesce(v_matter, v_request.request_no), 'quoteId', v_quote.id,
      'href', '/requester/requests/' || v_request.id::text || '#quotation')
  );
  insert into public.request_events(request_id, actor_id, event_type, from_status, to_status, payload)
  values (v_request.id, caller_id, 'quote.sent.pm', v_request.workflow_stage::text, 'negotiation',
    jsonb_build_object('approvalId', v_approval.id, 'quoteId', v_quote.id));
  return v_quote.id;
end;
$$;

revoke all on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_pm_quote_revision(uuid, text, numeric, timestamptz, text, jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.send_pm_quote_revision(uuid) from public, anon;
grant execute on function public.send_pm_quote_revision(uuid) to authenticated;

create or replace function public.admin_create_organization_invitation(
  target_organization_id uuid, target_email text, target_token_hash text,
  target_is_admin boolean, target_expires_at timestamptz, actor_user_id uuid
)
returns public.organization_invitations language plpgsql security invoker set search_path = '' as $$
declare invitation public.organization_invitations; normalized_email text := lower(trim(target_email)); actor_authorized boolean;
begin
  if normalized_email = '' then raise exception 'Invitation email is required.'; end if;
  if target_expires_at <= now() then raise exception 'Invitation expiration must be in the future.'; end if;
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    where member.user_id = actor_user_id and member.organization_id = target_organization_id
      and member.role = 'requester_admin'
  ) or exists (
    select 1 from public.organization_members member
    join public.customer_supplier_relationships relationship
      on relationship.supplier_organization_id = member.organization_id
      and relationship.customer_organization_id = target_organization_id and relationship.status = 'active'
    where member.user_id = actor_user_id and member.role = 'pm_admin'
  ) into actor_authorized;
  if not coalesce(actor_authorized, false) then raise exception 'You cannot invite members to this organization.'; end if;
  if exists (
    select 1 from public.organization_members member join public.profiles profile on profile.user_id = member.user_id
    where member.organization_id = target_organization_id and lower(profile.email) = normalized_email
  ) then raise exception 'This user is already a member of the organization.'; end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  update public.organization_invitations set
    status = case when expires_at <= now() then 'expired'::public.organization_invitation_status else 'revoked'::public.organization_invitation_status end,
    revoked_at = case when expires_at > now() then now() else null end, updated_at = now()
  where organization_id = target_organization_id and lower(email) = normalized_email and status = 'pending';
  insert into public.organization_invitations (
    organization_id, email, token_hash, invited_as_admin, invited_role, invited_by, expires_at
  ) values (
    target_organization_id, normalized_email, target_token_hash, target_is_admin,
    case when target_is_admin then 'requester_admin' else 'requester' end,
    actor_user_id, target_expires_at
  ) returning * into invitation;
  insert into public.organization_audit_events(organization_id, actor_id, event_type, payload)
  values (target_organization_id, actor_user_id, 'organization_invitation.created',
    jsonb_build_object('invitation_id', invitation.id, 'email', normalized_email,
      'invited_role', invitation.invited_role, 'expires_at', target_expires_at));
  return invitation;
end;
$$;

-- Replace role predicates embedded in RPCs created before the role enum was rebuilt.
do $$
declare
  function_ddl text;
  updated_ddl text;
begin
  select pg_get_functiondef(
    'public.get_pm_request_page(text,text,uuid,text,integer,integer)'::regprocedure
  ) into function_ddl;
  updated_ddl := replace(
    replace(
      function_ddl,
      'member.role in (''pm'', ''ops'', ''admin'')',
      'member.role in (''pm'', ''pm_admin'')'
    ),
    'order by (member.role = ''admin'') desc',
    'order by (member.role = ''pm_admin'') desc'
  );
  if updated_ddl = function_ddl then
    raise exception 'Unable to update get_pm_request_page role predicates.';
  end if;
  execute updated_ddl;
end;
$$;

create or replace function private.create_pm_admin_notifications(
  p_request_id uuid,
  p_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_dedupe_key text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (
    recipient_id, type, entity_type, entity_id, dedupe_key, payload
  )
  select recipient.user_id, p_type, p_entity_type, p_entity_id, p_dedupe_key, p_payload
  from (
    select member.user_id
    from public.translation_requests request_row
    join public.organization_members member
      on member.organization_id = request_row.supplier_organization_id
     and member.role = 'pm_admin'
    where request_row.id = p_request_id
    union
    select profile.user_id
    from public.profiles profile
    where profile.platform_role = 'super_admin'
  ) recipient
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.create_pm_admin_notifications(uuid, text, text, uuid, text, jsonb)
from public, anon, authenticated;

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
  join public.organizations supplier
    on supplier.id = member.organization_id
   and supplier.type = 'supplier'
  left join public.profiles profile on profile.user_id = member.user_id
  where member.user_id = actor_user_id
    and (member.role = 'pm_admin' or profile.platform_role = 'super_admin')
  order by (lower(supplier.code) = 'eci') desc, member.created_at, member.id
  limit 1;

  if supplier_id is null then
    raise exception 'Only a supplier administrator can create customer organizations.';
  end if;

  insert into public.organizations (name, type)
  values (trim(organization_name), 'customer')
  returning id into customer_id;

  insert into public.customer_organization_settings (
    organization_id, request_sharing_enabled, updated_by
  ) values (customer_id, false, actor_user_id);

  insert into public.customer_supplier_relationships (
    customer_organization_id, supplier_organization_id, status, created_by
  ) values (customer_id, supplier_id, 'active', actor_user_id);

  insert into public.organization_audit_events (
    organization_id, actor_id, event_type, payload
  ) values (
    customer_id, actor_user_id, 'customer_organization.created',
    jsonb_build_object('supplier_organization_id', supplier_id, 'request_sharing_enabled', false)
  );

  return customer_id;
end;
$$;

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
  join public.profiles profile on profile.user_id = actor.id
  where lower(actor.email) = lower(trim(changed_by_email))
    and (
      profile.platform_role = 'super_admin'
      or exists (
        select 1
        from public.organization_members member
        join public.customer_supplier_relationships relationship
          on relationship.supplier_organization_id = member.organization_id
         and relationship.customer_organization_id = target_organization_id
         and relationship.status = 'active'
        where member.user_id = actor.id and member.role = 'pm_admin'
      )
    )
  limit 1;

  if actor_user_id is null then
    raise exception 'The change actor must be a supplier or platform administrator.';
  end if;

  insert into public.customer_organization_settings (
    organization_id, request_sharing_enabled, updated_by
  ) values (target_organization_id, sharing_enabled, actor_user_id)
  on conflict (organization_id) do update
  set request_sharing_enabled = excluded.request_sharing_enabled,
      updated_by = excluded.updated_by,
      updated_at = now()
  returning * into settings;

  insert into public.organization_audit_events (
    organization_id, actor_id, event_type, payload
  ) values (
    target_organization_id, actor_user_id, 'request_sharing.changed',
    jsonb_build_object('enabled', sharing_enabled, 'reason', trim(change_reason))
  );

  return settings;
end;
$$;

-- Move all remaining RLS dependencies to the clean role enum, then remove the
-- compatibility enums so removed roles are absent from the final schema.
drop policy "Approvals follow supplier scope" on public.approval_requests;
drop policy "Customer settings follow relationship access" on public.customer_organization_settings;
drop policy "Customer supplier relationships follow participants" on public.customer_supplier_relationships;
drop policy "Organization audit events are visible to managers" on public.organization_audit_events;
drop policy "Organization members follow scoped access" on public.organization_members;
drop policy "Pricing rule sets are deleted by supplier admins" on public.pricing_rule_sets;
drop policy "Pricing rule sets are inserted by supplier admins" on public.pricing_rule_sets;
drop policy "Pricing rule sets are updated by supplier admins" on public.pricing_rule_sets;
drop policy "Pricing rule sets follow supplier access" on public.pricing_rule_sets;
drop policy "Pricing rules are deleted by supplier admins" on public.pricing_rules;
drop policy "Pricing rules are inserted by supplier admins" on public.pricing_rules;
drop policy "Pricing rules are updated by supplier admins" on public.pricing_rules;
drop policy "Pricing rules follow supplier rule set access" on public.pricing_rules;
drop policy "Requests follow scoped read access" on public.translation_requests;

drop function private.is_supplier_member(uuid, public.organization_role_legacy[]);
drop function public.has_org_role(uuid, public.organization_role_legacy[]);

create function private.is_supplier_member(
  target_supplier_org_id uuid,
  allowed_roles public.organization_role[] default array['pm', 'pm_admin']::public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.organization_id = target_supplier_org_id
      and member.user_id = (select auth.uid())
      and member.role = any(allowed_roles)
      and organization.type = 'supplier'
  );
$$;

create function public.has_org_role(
  target_org_id uuid,
  allowed_roles public.organization_role[]
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
    where member.organization_id = target_org_id
      and member.user_id = (select auth.uid())
      and member.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_supplier_member(uuid, public.organization_role[]) from public, anon;
grant execute on function private.is_supplier_member(uuid, public.organization_role[]) to authenticated, service_role;
revoke all on function public.has_org_role(uuid, public.organization_role[]) from public, anon;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated, service_role;

create policy "Approvals follow supplier scope" on public.approval_requests
for select to authenticated using (
  private.is_super_admin()
  or submitted_by = (select auth.uid())
  or private.is_supplier_member(supplier_organization_id)
);

create policy "Customer settings follow relationship access" on public.customer_organization_settings
for select to authenticated using (
  private.is_customer_member(organization_id)
  or exists (
    select 1 from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = customer_organization_settings.organization_id
      and relationship.status = 'active'
      and private.is_supplier_member(relationship.supplier_organization_id)
  )
);

create policy "Customer supplier relationships follow participants" on public.customer_supplier_relationships
for select to authenticated using (
  private.is_customer_member(customer_organization_id)
  or private.is_supplier_member(supplier_organization_id)
);

create policy "Organization audit events are visible to managers" on public.organization_audit_events
for select to authenticated using (
  private.can_manage_customer_org(organization_id)
  or private.is_supplier_member(organization_id, array['pm_admin']::public.organization_role[])
);

create policy "Organization members follow scoped access" on public.organization_members
for select to authenticated using (
  user_id = (select auth.uid())
  or private.is_customer_member(organization_id)
  or private.is_supplier_member(organization_id)
  or private.is_supplier_admin_for_customer(organization_id)
);

create policy "Pricing rule sets follow supplier access" on public.pricing_rule_sets
for select to authenticated using (private.is_supplier_member(supplier_organization_id));
create policy "Pricing rule sets are inserted by supplier admins" on public.pricing_rule_sets
for insert to authenticated with check (
  private.is_supplier_member(supplier_organization_id, array['pm_admin']::public.organization_role[])
);
create policy "Pricing rule sets are updated by supplier admins" on public.pricing_rule_sets
for update to authenticated
using (private.is_supplier_member(supplier_organization_id, array['pm_admin']::public.organization_role[]))
with check (private.is_supplier_member(supplier_organization_id, array['pm_admin']::public.organization_role[]));
create policy "Pricing rule sets are deleted by supplier admins" on public.pricing_rule_sets
for delete to authenticated using (
  private.is_supplier_member(supplier_organization_id, array['pm_admin']::public.organization_role[])
);

create policy "Pricing rules follow supplier rule set access" on public.pricing_rules
for select to authenticated using (
  exists (
    select 1 from public.pricing_rule_sets rule_set
    where rule_set.id = pricing_rules.rule_set_id
      and private.is_supplier_member(rule_set.supplier_organization_id)
  )
);
create policy "Pricing rules are inserted by supplier admins" on public.pricing_rules
for insert to authenticated with check (
  exists (
    select 1 from public.pricing_rule_sets rule_set
    where rule_set.id = pricing_rules.rule_set_id
      and private.is_supplier_member(
        rule_set.supplier_organization_id,
        array['pm_admin']::public.organization_role[]
      )
  )
);
create policy "Pricing rules are updated by supplier admins" on public.pricing_rules
for update to authenticated
using (
  exists (
    select 1 from public.pricing_rule_sets rule_set
    where rule_set.id = pricing_rules.rule_set_id
      and private.is_supplier_member(
        rule_set.supplier_organization_id,
        array['pm_admin']::public.organization_role[]
      )
  )
)
with check (
  exists (
    select 1 from public.pricing_rule_sets rule_set
    where rule_set.id = pricing_rules.rule_set_id
      and private.is_supplier_member(
        rule_set.supplier_organization_id,
        array['pm_admin']::public.organization_role[]
      )
  )
);
create policy "Pricing rules are deleted by supplier admins" on public.pricing_rules
for delete to authenticated using (
  exists (
    select 1 from public.pricing_rule_sets rule_set
    where rule_set.id = pricing_rules.rule_set_id
      and private.is_supplier_member(
        rule_set.supplier_organization_id,
        array['pm_admin']::public.organization_role[]
      )
  )
);

create policy "Requests follow scoped read access" on public.translation_requests
for select to authenticated using (
  requester_id = (select auth.uid())
  or (workflow_stage <> 'draft' and private.is_supplier_member(supplier_organization_id))
  or (
    workflow_stage <> 'draft'
    and private.is_customer_member(organization_id)
    and exists (
      select 1 from public.customer_organization_settings settings
      where settings.organization_id = translation_requests.organization_id
        and settings.request_sharing_enabled
    )
  )
);

drop type public.organization_role_legacy;
drop type public.comment_visibility_legacy;
drop type public.organization_type_legacy;

create or replace function public.admin_accept_organization_invitation(
  target_token_hash text, target_user_id uuid, target_email text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare invitation public.organization_invitations; auth_email text := lower(trim(target_email)); profile_already_exists boolean;
begin
  if target_user_id is null or auth_email is null or auth_email = '' then raise exception 'The authenticated email does not match the invitation.'; end if;
  select * into invitation from public.organization_invitations where token_hash = target_token_hash for update;
  if invitation.id is null then raise exception 'Invitation not found.'; end if;
  if invitation.status <> 'pending' then raise exception 'This invitation is no longer available.'; end if;
  if invitation.expires_at <= now() then
    update public.organization_invitations set status = 'expired', updated_at = now() where id = invitation.id;
    raise exception 'This invitation has expired.';
  end if;
  if lower(invitation.email) <> auth_email then raise exception 'The authenticated email does not match the invitation.'; end if;
  if exists (
    select 1 from public.organization_members member join public.organizations organization on organization.id = member.organization_id
    where member.user_id = target_user_id and member.role in ('requester', 'requester_admin')
      and organization.type = 'customer' and member.organization_id <> invitation.organization_id
  ) then raise exception 'This account already belongs to another customer organization.'; end if;
  select exists (select 1 from public.profiles where user_id = target_user_id) into profile_already_exists;
  insert into public.profiles(user_id, email, password_setup_required)
  values (target_user_id, auth_email, not profile_already_exists)
  on conflict (user_id) do update set email = excluded.email, updated_at = now();
  insert into public.organization_members(organization_id, user_id, role)
  values (invitation.organization_id, target_user_id, invitation.invited_role);
  update public.organization_invitations set status = 'accepted', accepted_by = target_user_id,
    accepted_at = now(), updated_at = now() where id = invitation.id;
  insert into public.organization_audit_events(organization_id, actor_id, event_type, payload)
  values (invitation.organization_id, target_user_id, 'organization_invitation.accepted',
    jsonb_build_object('invitation_id', invitation.id, 'email', auth_email, 'role', invitation.invited_role));
  return invitation.organization_id;
end;
$$;

revoke all on function public.admin_create_organization_invitation(uuid, text, text, boolean, timestamptz, uuid)
from public, anon, authenticated;
grant execute on function public.admin_create_organization_invitation(uuid, text, text, boolean, timestamptz, uuid) to service_role;
revoke all on function public.admin_accept_organization_invitation(text, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_accept_organization_invitation(text, uuid, text) to service_role;
alter table public.organization_invitations drop column invited_as_admin;

create or replace function public.admin_create_organization_invitation(
  target_organization_id uuid, target_email text, target_token_hash text,
  target_is_admin boolean, target_expires_at timestamptz, actor_user_id uuid
)
returns public.organization_invitations language plpgsql security invoker set search_path = '' as $$
declare invitation public.organization_invitations; normalized_email text := lower(trim(target_email)); actor_authorized boolean;
begin
  if normalized_email = '' then raise exception 'Invitation email is required.'; end if;
  if target_expires_at <= now() then raise exception 'Invitation expiration must be in the future.'; end if;
  select private.is_super_admin() or exists (
    select 1 from public.organization_members member
    where member.user_id = actor_user_id and member.organization_id = target_organization_id and member.role = 'requester_admin'
  ) or exists (
    select 1 from public.organization_members member
    join public.customer_supplier_relationships relationship on relationship.supplier_organization_id = member.organization_id
      and relationship.customer_organization_id = target_organization_id and relationship.status = 'active'
    where member.user_id = actor_user_id and member.role = 'pm_admin'
  ) into actor_authorized;
  if not coalesce(actor_authorized, false) then raise exception 'You cannot invite members to this organization.'; end if;
  if exists (
    select 1 from public.organization_members member join public.profiles profile on profile.user_id = member.user_id
    where member.organization_id = target_organization_id and lower(profile.email) = normalized_email
  ) then raise exception 'This user is already a member of the organization.'; end if;
  perform 1 from public.organizations where id = target_organization_id for update;
  update public.organization_invitations set
    status = case when expires_at <= now() then 'expired'::public.organization_invitation_status else 'revoked'::public.organization_invitation_status end,
    revoked_at = case when expires_at > now() then now() else null end, updated_at = now()
  where organization_id = target_organization_id and lower(email) = normalized_email and status = 'pending';
  insert into public.organization_invitations(organization_id, email, token_hash, invited_role, invited_by, expires_at)
  values (target_organization_id, normalized_email, target_token_hash,
    case when target_is_admin then 'requester_admin' else 'requester' end,
    actor_user_id, target_expires_at) returning * into invitation;
  insert into public.organization_audit_events(organization_id, actor_id, event_type, payload)
  values (target_organization_id, actor_user_id, 'organization_invitation.created',
    jsonb_build_object('invitation_id', invitation.id, 'email', normalized_email,
      'invited_role', invitation.invited_role, 'expires_at', target_expires_at));
  return invitation;
end;
$$;
