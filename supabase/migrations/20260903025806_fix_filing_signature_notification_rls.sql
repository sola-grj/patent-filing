-- The signature-send RPC writes its recipient notification in the same
-- transaction.  The former policy queried filing_signature_requests as the
-- calling user, which can be denied by that table's RLS before the policy can
-- establish that the PM manages the request.  Keep the same ownership check in
-- a narrowly scoped security-definer helper instead.
create or replace function private.can_create_filing_signature_notification(
  target_signature_request_id uuid,
  target_recipient_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = target_signature_request_id
      and signature_request.recipient_id = target_recipient_id
      and private.is_supplier_staff_for_request(signature_request.request_id)
  );
$$;

revoke all on function private.can_create_filing_signature_notification(uuid, uuid)
from public, anon;
grant execute on function private.can_create_filing_signature_notification(uuid, uuid)
to authenticated, service_role;

drop policy if exists "Supplier staff can create signature notifications"
on public.notifications;

create policy "Supplier staff can create signature notifications"
on public.notifications for insert to authenticated
with check (
  entity_type = 'filing_signature_request'
  and private.can_create_filing_signature_notification(entity_id, recipient_id)
);
