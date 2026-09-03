create or replace function private.has_legacy_filing_signature_source(
  target_signature_request_id uuid
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
      and private.can_read_request(signature_request.request_id)
  )
  and exists (
    select 1
    from public.filing_signature_files source_file
    where source_file.signature_request_id = target_signature_request_id
      and source_file.direction = 'pm_to_requester'
      and source_file.ep_country_id is null
  );
$$;

revoke all on function private.has_legacy_filing_signature_source(uuid) from public;
grant execute on function private.has_legacy_filing_signature_source(uuid) to authenticated;

drop policy if exists "Signature participants can upload files"
on public.filing_signature_files;

create policy "Signature participants can upload files"
on public.filing_signature_files for insert to authenticated
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
          and private.is_supplier_staff_for_request(signature_request.request_id)
        )
        or (
          direction = 'requester_to_pm'
          and signature_request.status = 'sent'
          and signature_request.recipient_id = (select auth.uid())
        )
      )
      and (
        exists (
          select 1
          from public.translation_requirements requirement
          where requirement.request_id = signature_request.request_id
            and requirement.ep_service_type_code in (
              'traditional_validation',
              'traditional_validation_unitary_patent'
            )
            and filing_signature_files.ep_country_id = any(requirement.ep_country_ids)
        )
        or (
          direction = 'requester_to_pm'
          and filing_signature_files.ep_country_id is null
          and private.has_legacy_filing_signature_source(signature_request.id)
        )
        or (
          filing_signature_files.ep_country_id is null
          and not exists (
            select 1
            from public.translation_requirements requirement
            where requirement.request_id = signature_request.request_id
              and requirement.ep_service_type_code in (
                'traditional_validation',
                'traditional_validation_unitary_patent'
              )
          )
        )
      )
  )
);
