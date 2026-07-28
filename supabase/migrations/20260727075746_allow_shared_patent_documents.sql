alter table public.request_files
  drop constraint if exists request_files_storage_bucket_storage_path_key;

create index if not exists request_files_storage_location_idx
  on public.request_files(storage_bucket, storage_path);
