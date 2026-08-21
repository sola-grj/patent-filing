alter table public.translation_requirements
  add column ep_service_type_code text,
  add column translation_required boolean not null default false,
  add column service_item_code text,
  add column opt_out_country_ids integer[] not null default '{}'::integer[];

update public.translation_requirements
set translation_required = 'translation'::public.translation_service_type = any(service_types);

update public.translation_requirements
set ep_service_type_code = case
  when 'european_patent_grant_registration'::public.translation_service_type = any(service_types)
    then 'ep_granting'
  when epv_type_code = 'traditional_validation'
    then 'traditional_validation'
  when epv_type_code = 'unitary_effect'
    then 'unitary_patent'
  else null
end
where ep_service_type_code is null;

update public.translation_requirements
set service_item_code = 'traditional_validation'
where ep_service_type_code = 'traditional_validation'
  and service_item_code is null;

alter table public.translation_requirements
  alter column source_language drop not null,
  alter column target_language drop not null,
  alter column target_languages set default '{}'::text[];

alter table public.translation_requirements
  drop constraint if exists translation_requirements_target_languages_nonempty;

alter table public.translation_requirements
  add constraint translation_requirements_ep_service_type_code_valid
    check (
      ep_service_type_code is null
      or ep_service_type_code in (
        'ep_granting',
        'traditional_validation',
        'unitary_patent',
        'traditional_validation_unitary_patent'
      )
    ),
  add constraint translation_requirements_service_item_code_valid
    check (
      service_item_code is null
      or service_item_code in (
        'traditional_validation',
        'traditional_validation_opt_out',
        'opt_out_only',
        'opt_in_only'
      )
    ),
  add constraint translation_requirements_opt_out_country_ids_no_nulls
    check (array_position(opt_out_country_ids, null) is null),
  add constraint translation_requirements_opt_out_country_ids_subset
    check (opt_out_country_ids <@ ep_country_ids),
  add constraint translation_requirements_translation_compatibility
    check (
      translation_required = (
        'translation'::public.translation_service_type = any(service_types)
      )
    ),
  add constraint translation_requirements_traditional_service_item_required
    check (
      case
        when ep_service_type_code in (
          'traditional_validation',
          'traditional_validation_unitary_patent'
        ) then service_item_code is not null
        else service_item_code is null
      end
    ),
  add constraint translation_requirements_opt_out_scope_valid
    check (
      case
        when service_item_code = 'traditional_validation_opt_out'
          then cardinality(opt_out_country_ids) > 0
        else cardinality(opt_out_country_ids) = 0
      end
    );

alter table public.file_parse_results
  add column document_kind text,
  add column source_url text,
  add column retrieval_mode text,
  add column document_language text,
  add column publication_date date,
  add column document_date date,
  add column document_sha256 text,
  add column epo_document_id text,
  add column is_pre_grant boolean not null default false,
  add column is_legacy_pre_grant boolean not null default false,
  add constraint file_parse_results_retrieval_mode_valid
    check (retrieval_mode is null or retrieval_mode in ('automatic', 'customer_upload')),
  add constraint file_parse_results_document_sha256_valid
    check (document_sha256 is null or document_sha256 ~ '^[0-9a-f]{64}$'),
  add constraint file_parse_results_legacy_requires_pre_grant
    check (not is_legacy_pre_grant or is_pre_grant);

comment on column public.translation_requirements.ep_service_type_code is
  'Stable EPO service identity, independent from the compatibility service_types array.';

comment on column public.translation_requirements.translation_required is
  'EPO translation toggle. Kept in sync with the translation member in service_types.';

comment on column public.translation_requirements.service_item_code is
  'Traditional validation service item selected by the requester.';

comment on column public.translation_requirements.opt_out_country_ids is
  'Confirmed Opt Out subset of ep_country_ids for Traditional Validation + Opt Out.';

comment on column public.file_parse_results.document_kind is
  'Audited EPO document identity such as B1, TIFG_CLEAN, or TIFG_LEGACY.';

comment on column public.file_parse_results.structure_json is
  'Includes five-part EPO structure, per-part status, parsing method, word counts, and warnings.';
