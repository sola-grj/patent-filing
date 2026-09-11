-- Traditional Validation requests whose selected countries do not require POA
-- still use the existing non-country signature-document workflow. The previous
-- policy only allowed a NULL country when the request had no Traditional
-- Validation requirement at all, so those flat uploads were rejected by RLS.
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
          and not exists (
            select 1
            from public.filing_signature_country_confirmations confirmation
            where confirmation.signature_request_id = signature_request.id
              and confirmation.ep_country_id = filing_signature_files.ep_country_id
          )
        )
      )
      and (
        exists (
          select 1
          from public.translation_requirements requirement
          join public.ep_countries country
            on country.id = filing_signature_files.ep_country_id
           and country.poa_requirement <> 'not_required'
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
            join unnest(requirement.ep_country_ids) selected_country(id) on true
            join public.ep_countries country
              on country.id = selected_country.id
             and country.poa_requirement <> 'not_required'
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
