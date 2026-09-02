alter table public.filing_signature_files
  add column ep_country_id integer
  references public.ep_countries(id) on update restrict on delete restrict;

create index filing_signature_files_package_direction_country_idx
on public.filing_signature_files(
  signature_request_id,
  direction,
  ep_country_id,
  created_at
);

comment on column public.filing_signature_files.ep_country_id is
  'Selected EP country for Traditional Validation POA files. NULL for non-traditional and legacy/general documents.';

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
          and exists (
            select 1
            from public.filing_signature_files legacy_source
            where legacy_source.signature_request_id = signature_request.id
              and legacy_source.direction = 'pm_to_requester'
              and legacy_source.ep_country_id is null
          )
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
