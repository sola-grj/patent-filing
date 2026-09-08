-- A single ownership-checked read replaces the old request_patents ->
-- request_files -> file_parse_results -> request_files sequence when a Draft
-- already contains the exact patent selected in the wizard.
create or replace function public.get_durable_draft_patent_file_ids(
  p_request_id uuid,
  p_patent_number text,
  p_requires_files boolean
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  request_owner uuid;
  file_ids uuid[];
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select request.requester_id into request_owner
  from public.translation_requests request
  where request.id = p_request_id
    and request.workflow_stage = 'draft'
  for share;
  if request_owner is null or request_owner <> caller_id then
    return null;
  end if;

  if not exists (
    select 1
    from public.request_patents patent
    where patent.request_id = p_request_id
      and patent.patent_number = p_patent_number
  ) then
    return null;
  end if;

  select coalesce(array_agg(file.id order by file.created_at), '{}'::uuid[])
    into file_ids
  from public.request_files file
  where file.request_id = p_request_id
    and file.source = 'patent_search';

  if p_requires_files and cardinality(file_ids) = 0 then
    return null;
  end if;

  if p_requires_files and exists (
    select 1
    from unnest(file_ids) file_id
    left join public.file_parse_results result on result.file_id = file_id
    where result.file_id is null
      or result.parse_status not in ('completed', 'needs_review')
  ) then
    return null;
  end if;

  return file_ids;
end;
$$;

revoke all on function public.get_durable_draft_patent_file_ids(uuid, text, boolean)
  from public, anon;
grant execute on function public.get_durable_draft_patent_file_ids(uuid, text, boolean)
  to authenticated;

-- Submission already has verified analysis. Persist its Request-local parse
-- records in the same database call as the patent file graph instead of
-- returning to the application for a separate parse-results write.
create or replace function public.persist_patent_source_and_parse_for_wizard(
  p_request_id uuid,
  p_patent jsonb,
  p_analysis jsonb,
  p_files jsonb
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_file_ids uuid[];
  request_file_id uuid;
  file_index integer := 0;
  file jsonb;
  analysis_file jsonb;
  source_document jsonb := coalesce(p_analysis->'source_document', '{}'::jsonb);
  analysis_status text := coalesce(p_analysis->>'status', 'success');
  timestamp_now timestamptz := now();
begin
  request_file_ids := public.persist_patent_source_for_wizard(
    p_request_id, p_patent, p_analysis, p_files, true
  );

  foreach request_file_id in array request_file_ids
  loop
    file := coalesce(p_files->file_index, '{}'::jsonb);
    analysis_file := coalesce(p_analysis->'files'->file_index, p_analysis->'files'->0, '{}'::jsonb);

    insert into public.file_parse_jobs (
      file_id, status, attempt_count, started_at, finished_at, payload
    ) values (
      request_file_id,
      case when analysis_status = 'partial' then 'needs_review'::public.file_parse_job_status
        else 'success'::public.file_parse_job_status end,
      1, timestamp_now, timestamp_now,
      jsonb_build_object(
        'input_mode', p_analysis->>'input_mode',
        'status', analysis_status,
        'analysis_profile', p_analysis->>'analysis_profile',
        'warnings', coalesce(p_analysis->'warnings', '[]'::jsonb)
      )
    );

    insert into public.file_parse_results (
      file_id, parse_status, word_count, page_count, claim_count,
      technical_fields, structure_json, ocr_required, manual_review_required,
      document_kind, source_url, retrieval_mode, document_language,
      publication_date, document_date, document_sha256, epo_document_id,
      is_pre_grant, is_legacy_pre_grant
    ) values (
      request_file_id,
      case when analysis_status = 'partial' then 'needs_review'::public.file_parse_status
        else 'completed'::public.file_parse_status end,
      coalesce((analysis_file->>'total_words')::integer, (file->>'wordCount')::integer, 12000),
      coalesce((file->>'pageCount')::integer, 0),
      coalesce((analysis_file->>'claims_count')::integer,
        (p_analysis->'aggregate'->>'claims_count')::integer, (file->>'claimCount')::integer, 0),
      array[coalesce(p_patent->>'technicalField', 'patent')],
      jsonb_build_object(
        'parts', coalesce(analysis_file->'parts', '{}'::jsonb),
        'document_text_words', coalesce(analysis_file->>'document_text_words', '0')::integer,
        'drawing_ocr_words', coalesce(analysis_file->>'drawing_ocr_words', '0')::integer,
        'aggregate', coalesce(p_analysis->'aggregate', '{}'::jsonb),
        'analysis_profile', p_analysis->>'analysis_profile',
        'warnings', coalesce(analysis_file->'warnings', '[]'::jsonb),
        'counting_standard', p_analysis->>'counting_standard',
        'excluded_content', coalesce(p_analysis->'excluded_content', '[]'::jsonb)
      ),
      false,
      analysis_status = 'partial' or coalesce((source_document->>'is_pre_grant')::boolean, false),
      coalesce(source_document->>'document_kind', source_document->>'kind_code'),
      coalesce(source_document->>'source_url', source_document->>'upstream_url', file->>'sourceUrl'),
      coalesce(source_document->>'retrieval_mode', 'automatic'),
      source_document->>'language', nullif(source_document->>'publication_date', '')::date,
      nullif(source_document->>'document_date', '')::date,
      coalesce(source_document->>'sha256', analysis_file->>'sha256'),
      coalesce(source_document->>'epo_document_id', source_document->>'normalized_number'),
      coalesce((source_document->>'is_pre_grant')::boolean, false),
      coalesce((source_document->>'is_legacy_pre_grant')::boolean, false)
    );
    file_index := file_index + 1;
  end loop;

  return request_file_ids;
end;
$$;

revoke all on function public.persist_patent_source_and_parse_for_wizard(uuid, jsonb, jsonb, jsonb)
  from public, anon;
grant execute on function public.persist_patent_source_and_parse_for_wizard(uuid, jsonb, jsonb, jsonb)
  to authenticated;
