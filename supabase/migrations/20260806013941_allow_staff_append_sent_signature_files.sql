-- Requester: read own package and upload returned files while it is pending.
-- PM/operations: may add source documents to the same draft or pending package.
-- Translator: no access is granted by these policies.
drop policy "Signature files can be uploaded by participants"
on public.filing_signature_files;

create policy "Signature files can be uploaded by participants"
on public.filing_signature_files
for insert
to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1
    from public.filing_signature_requests signature_request
    where signature_request.id = signature_request_id
      and (
        (
          direction = 'pm_to_requester'
          and signature_request.status in ('draft', 'sent')
          and public.is_platform_staff()
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
        )
      )
  )
);
