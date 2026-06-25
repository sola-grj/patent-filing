create policy "PM staff can upload deliverable zips"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'request-files'
  and (storage.foldername(name))[1] = 'deliverables'
  and public.is_platform_staff()
);

create policy "Task participants can read deliverable zips"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and public.can_access_task(deliverable.task_id)
  )
);

create policy "Task participants can replace deliverable zips"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and public.can_access_task(deliverable.task_id)
  )
)
with check (
  bucket_id = 'request-files'
  and (
    (
      (storage.foldername(name))[1] = 'deliverables'
      and public.is_platform_staff()
    )
    or exists (
      select 1
      from public.task_deliverables deliverable
      where deliverable.storage_bucket = bucket_id
        and deliverable.storage_path = name
        and public.can_access_task(deliverable.task_id)
    )
  )
);

create policy "Task participants can delete deliverable zips"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-files'
  and exists (
    select 1
    from public.task_deliverables deliverable
    where deliverable.storage_bucket = bucket_id
      and deliverable.storage_path = name
      and public.can_access_task(deliverable.task_id)
  )
);
