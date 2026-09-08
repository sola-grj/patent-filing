-- Keep the patent source graph atomic and avoid three client-to-database round trips
-- (search, candidate, then files) on the submit critical path.
create or replace function public.persist_patent_source_for_wizard(
  p_request_id uuid,
  p_patent jsonb,
  p_analysis jsonb,
  p_files jsonb,
  p_submit boolean default false
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  request_owner uuid;
  search_id uuid := gen_random_uuid();
  candidate_id uuid := gen_random_uuid();
  request_file_ids uuid[] := '{}'::uuid[];
  file jsonb;
  request_file_id uuid;
  analysis_aggregate jsonb := coalesce(p_analysis->'aggregate', '{}'::jsonb);
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.requester_id into request_owner
  from public.translation_requests request
  where request.id = p_request_id
    and request.workflow_stage = 'draft'
  for update;
  if request_owner is null or request_owner <> caller_id then
    raise exception 'Draft Request is not editable' using errcode = '42501';
  end if;

  insert into public.patent_searches (
    id, request_id, query, detected_patent_type, status, raw_response
  ) values (
    search_id, p_request_id,
    coalesce(nullif(p_patent->>'patentQuery', ''), p_patent->>'patentNumber'),
    'Publication', 'completed', coalesce(p_patent->'sourceSnapshot', p_patent)
  );

  insert into public.patent_candidates (
    id, search_id, patent_number, title, jurisdiction, application_no,
    publication_no, applicants, metadata
  ) values (
    candidate_id, search_id, p_patent->>'patentNumber', p_patent->>'title',
    p_patent->>'jurisdiction', p_patent->>'applicationNo', p_patent->>'publicationNo',
    coalesce(p_patent->'applicants', '[]'::jsonb), p_patent
  );

  insert into public.request_patents (
    request_id, patent_number, application_no, publication_no, title, abstract,
    jurisdiction, source, applicants, inventors, filing_date, publication_date,
    language, first_priority_date, international_filing_date, filing_deadline_30_months,
    filing_deadline_31_months, grant_publication_date,
    rule_71_3_communication_date, total_pages, legal_status, ipc_codes, cpc_codes,
    abstract_word_count, description_word_count, claims_word_count, claims_count,
    drawing_count, source_snapshot
  ) values (
    p_request_id, p_patent->>'patentNumber', nullif(p_patent->>'applicationNo', ''),
    nullif(p_patent->>'publicationNo', ''), nullif(p_patent->>'title', ''),
    nullif(p_patent->>'description', ''), nullif(p_patent->>'jurisdiction', ''),
    nullif(p_patent->>'source', ''), coalesce(p_patent->'applicants', '[]'::jsonb),
    coalesce(p_patent->'inventors', '[]'::jsonb),
    nullif(p_patent->>'filingDate', '')::date,
    nullif(p_patent->>'publicationDate', '')::date,
    nullif(p_patent->>'language', ''), nullif(p_patent->>'firstPriorityDate', '')::date,
    nullif(p_patent->>'internationalFilingDate', '')::date,
    nullif(p_patent->>'filingDeadline30Months', '')::date,
    nullif(p_patent->>'filingDeadline31Months', '')::date,
    nullif(p_patent->>'grantPublicationDate', '')::date,
    nullif(p_patent->>'rule713CommunicationDate', '')::date,
    coalesce((p_patent->>'totalPages')::integer, 0), nullif(p_patent->>'legalStatus', ''),
    array(select jsonb_array_elements_text(coalesce(p_patent->'ipcCodes', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_patent->'cpcCodes', '[]'::jsonb))),
    coalesce((analysis_aggregate->>'abstract_words')::integer, (p_patent->>'abstractWordCount')::integer, 0),
    coalesce((analysis_aggregate->>'description_words')::integer, 0)
      + coalesce((analysis_aggregate->>'description_drawings_words')::integer, 0),
    coalesce((analysis_aggregate->>'claims_words')::integer, (p_patent->>'claimsWordCount')::integer, 0),
    coalesce((analysis_aggregate->>'claims_count')::integer, (p_patent->>'claimsCount')::integer, 0),
    coalesce((p_patent->>'drawingCount')::integer, 0),
    coalesce(p_patent->'sourceSnapshot', p_patent)
  ) on conflict (request_id) do update set
    patent_number = excluded.patent_number,
    application_no = excluded.application_no,
    publication_no = excluded.publication_no,
    title = excluded.title,
    abstract = excluded.abstract,
    jurisdiction = excluded.jurisdiction,
    source = excluded.source,
    applicants = excluded.applicants,
    inventors = excluded.inventors,
    filing_date = excluded.filing_date,
    publication_date = excluded.publication_date,
    language = excluded.language,
    first_priority_date = excluded.first_priority_date,
    international_filing_date = excluded.international_filing_date,
    filing_deadline_30_months = excluded.filing_deadline_30_months,
    filing_deadline_31_months = excluded.filing_deadline_31_months,
    grant_publication_date = excluded.grant_publication_date,
    rule_71_3_communication_date = excluded.rule_71_3_communication_date,
    total_pages = excluded.total_pages,
    legal_status = excluded.legal_status,
    ipc_codes = excluded.ipc_codes,
    cpc_codes = excluded.cpc_codes,
    abstract_word_count = excluded.abstract_word_count,
    description_word_count = excluded.description_word_count,
    claims_word_count = excluded.claims_word_count,
    claims_count = excluded.claims_count,
    drawing_count = excluded.drawing_count,
    source_snapshot = excluded.source_snapshot;

  for file in select value from jsonb_array_elements(coalesce(p_files, '[]'::jsonb))
  loop
    request_file_id := gen_random_uuid();
    insert into public.patent_file_versions (
      candidate_id, version_label, file_type, language, source_url, is_selected, metadata
    ) values (
      candidate_id, file->>'label', file->>'fileType', file->>'language',
      file->>'sourceUrl', true, file
    );
    insert into public.request_files (
      id, request_id, source, storage_bucket, storage_path, original_filename,
      mime_type, file_role, language, version_label, confirmed_for_translation,
      status, metadata
    ) values (
      request_file_id, p_request_id, 'patent_search', null, null,
      concat(file->>'label', '.', file->>'fileType'),
      case when file->>'fileType' = 'txt' then 'text/plain' else 'application/pdf' end,
      file->>'label', file->>'language', file->>'label', true,
      case when p_submit then 'parsing'::public.request_file_status else 'validated'::public.request_file_status end,
      jsonb_build_object('source_url', file->>'sourceUrl', 'patent_file', file)
    );
    request_file_ids := array_append(request_file_ids, request_file_id);
  end loop;

  return request_file_ids;
end;
$$;

revoke all on function public.persist_patent_source_for_wizard(uuid, jsonb, jsonb, jsonb, boolean)
  from public, anon;
grant execute on function public.persist_patent_source_for_wizard(uuid, jsonb, jsonb, jsonb, boolean)
  to authenticated;
