update storage.buckets
set allowed_mime_types = array(
  select distinct mime_type
  from unnest(
    coalesce(allowed_mime_types, array[]::text[]) ||
    array['application/zip', 'application/x-zip-compressed']::text[]
  ) as mime_type
)
where id = 'request-files';
