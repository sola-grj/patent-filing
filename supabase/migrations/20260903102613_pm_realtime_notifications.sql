-- PM notifications are durable rows. Realtime only delivers changes to the
-- recipient's browser; it is not the system of record.

drop policy if exists "Notifications are visible to recipient and staff" on public.notifications;
drop policy if exists "Notifications can be updated by recipient or staff" on public.notifications;
drop policy if exists "Notifications are visible to recipient" on public.notifications;
drop policy if exists "Notifications can be updated by recipient" on public.notifications;
drop policy if exists "Notifications can be created by staff" on public.notifications;
drop policy if exists "Supplier staff can create signature notifications" on public.notifications;

revoke insert on table public.notifications from authenticated;

create policy "Notifications are visible to recipient"
on public.notifications for select to authenticated
using (recipient_id = (select auth.uid()));

create policy "Notifications can be marked read by recipient"
on public.notifications for update to authenticated
using (recipient_id = (select auth.uid()))
with check (recipient_id = (select auth.uid()));

create or replace function public.dismiss_filing_signature_notification(
  p_signature_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  signature_request public.filing_signature_requests;
begin
  if not public.is_platform_staff() then
    raise exception 'Only PM staff can dismiss signature notifications.' using errcode = '42501';
  end if;

  select * into signature_request
  from public.filing_signature_requests
  where id = p_signature_request_id;
  if not found or not private.is_supplier_staff_for_request(signature_request.request_id) then
    raise exception 'Signature request is not available for this PM.' using errcode = '42501';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now()), updated_at = now()
  where entity_type = 'filing_signature_request'
    and entity_id = p_signature_request_id
    and read_at is null;
end;
$$;

revoke all on function public.dismiss_filing_signature_notification(uuid) from public, anon;
grant execute on function public.dismiss_filing_signature_notification(uuid) to authenticated;

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
  select
    member.user_id,
    p_type,
    p_entity_type,
    p_entity_id,
    p_dedupe_key,
    p_payload
  from public.translation_requests request_row
  join public.organizations supplier
    on supplier.id = request_row.supplier_organization_id
   and supplier.type = 'supplier'::public.organization_type
   and lower(supplier.code) = 'eci'
  join public.organization_members member
    on member.organization_id = supplier.id
   and member.role = 'admin'::public.organization_role
  where request_row.id = p_request_id
  on conflict (recipient_id, dedupe_key) do nothing;
end;
$$;

revoke all on function private.create_pm_admin_notifications(uuid, text, text, uuid, text, jsonb)
from public, anon, authenticated;

create or replace function private.pm_notification_request_context(p_request_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'requestId', request_row.id,
    'requestNo', request_row.request_no,
    'matter', coalesce(patent.patent_number, request_row.title, request_row.request_no),
    'customerName', customer.name
  )
  from public.translation_requests request_row
  join public.organizations customer on customer.id = request_row.organization_id
  left join lateral (
    select request_patent.patent_number
    from public.request_patents request_patent
    where request_patent.request_id = request_row.id
    order by request_patent.created_at asc
    limit 1
  ) patent on true
  where request_row.id = p_request_id;
$$;

revoke all on function private.pm_notification_request_context(uuid)
from public, anon, authenticated;

create or replace function private.notify_pm_request_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.workflow_stage = 'draft'::public.workflow_stage
    and new.workflow_stage <> 'draft'::public.workflow_stage
    and new.submitted_at is not null then
    perform private.create_pm_admin_notifications(
      new.id,
      'pm_request_submitted',
      'translation_request',
      new.id,
      'pm-request-submitted:' || new.id::text,
      private.pm_notification_request_context(new.id) || jsonb_build_object(
        'href', '/pm/' || new.id::text
      )
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_pm_quote_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'sent'::public.quote_status
    and new.status = 'accepted'::public.quote_status then
    perform private.create_pm_admin_notifications(
      new.request_id,
      'pm_quote_confirmed',
      'quote',
      new.id,
      'pm-quote-confirmed:' || new.id::text,
      private.pm_notification_request_context(new.request_id) || jsonb_build_object(
        'quoteId', new.id,
        'quoteVersion', new.version_no,
        'href', '/pm/' || new.request_id::text || '#quotation'
      )
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_pm_negotiation_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'open'::public.negotiation_status
    and new.status = 'accepted'::public.negotiation_status
    and not public.is_platform_staff() then
    perform private.create_pm_admin_notifications(
      new.request_id,
      'pm_quote_confirmed',
      'quote_negotiation',
      new.id,
      'pm-quote-confirmed:negotiation:' || new.id::text,
      private.pm_notification_request_context(new.request_id) || jsonb_build_object(
        'quoteId', coalesce(new.response_quote_id, new.quote_id),
        'negotiationId', new.id,
        'href', '/pm/' || new.request_id::text || '#quotation'
      )
    );
  end if;
  return new;
end;
$$;

create or replace function private.notify_pm_signed_documents_received()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  returned_file_count integer;
begin
  if old.status = 'sent'::public.filing_signature_request_status
    and new.status = 'completed'::public.filing_signature_request_status then
    select count(*) into returned_file_count
    from public.filing_signature_files file
    where file.signature_request_id = new.id
      and file.direction = 'requester_to_pm';

    perform private.create_pm_admin_notifications(
      new.request_id,
      'pm_signed_documents_received',
      'filing_signature_request',
      new.id,
      'pm-signed-documents-received:' || new.id::text,
      private.pm_notification_request_context(new.request_id) || jsonb_build_object(
        'signatureRequestId', new.id,
        'fileCount', returned_file_count,
        'href', '/pm/' || new.request_id::text || '#signature-documents'
      )
    );
  end if;
  return new;
end;
$$;

create trigger notify_pm_on_request_submitted
after update of workflow_stage, submitted_at on public.translation_requests
for each row execute function private.notify_pm_request_submitted();

create trigger notify_pm_on_quote_confirmed
after update of status on public.quotes
for each row execute function private.notify_pm_quote_confirmed();

create trigger notify_pm_on_negotiation_confirmed
after update of status on public.quote_negotiations
for each row execute function private.notify_pm_negotiation_confirmed();

create trigger notify_pm_on_signed_documents_received
after update of status on public.filing_signature_requests
for each row execute function private.notify_pm_signed_documents_received();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
