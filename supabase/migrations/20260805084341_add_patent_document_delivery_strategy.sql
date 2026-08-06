alter table public.patent_documents
  add column delivery_strategy text;

update public.patent_documents
set delivery_strategy = 'generated_cache'
where delivery_strategy is null;

alter table public.patent_documents
  alter column delivery_strategy set default 'generated_cache',
  alter column delivery_strategy set not null,
  alter column byte_size drop not null,
  alter column sha256 drop not null,
  alter column storage_bucket drop default,
  alter column storage_bucket drop not null,
  alter column storage_path drop not null;

alter table public.patent_documents
  drop constraint if exists patent_documents_byte_size_check,
  drop constraint if exists patent_documents_sha256_check,
  drop constraint if exists patent_documents_storage_path_key,
  drop constraint if exists patent_documents_patent_id_document_type_sha256_key;

alter table public.patent_documents
  add constraint patent_documents_delivery_strategy_check
    check (delivery_strategy in ('external_url', 'generated_cache')),
  add constraint patent_documents_byte_size_check
    check (byte_size is null or byte_size >= 0),
  add constraint patent_documents_sha256_check
    check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add constraint patent_documents_delivery_location_check
    check (
      (
        delivery_strategy = 'external_url'
        and upstream_source_url is not null
        and storage_bucket is null
        and storage_path is null
      )
      or
      (
        delivery_strategy = 'generated_cache'
        and byte_size is not null
        and sha256 is not null
        and storage_bucket is not null
        and storage_path is not null
      )
    );

alter table public.patent_documents
  add constraint patent_documents_generated_cache_key
    unique (patent_id, document_type, delivery_strategy, sha256);

create unique index patent_documents_external_url_unique_idx
  on public.patent_documents(patent_id, document_type, upstream_source_url)
  where delivery_strategy = 'external_url';

create unique index patent_documents_storage_path_unique_idx
  on public.patent_documents(storage_path)
  where storage_path is not null;

alter table public.request_files
  alter column storage_bucket drop not null,
  alter column storage_path drop not null;
