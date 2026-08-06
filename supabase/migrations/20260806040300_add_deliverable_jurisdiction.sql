alter table public.task_deliverables
  add column jurisdiction_code text;

alter table public.task_deliverables
  add constraint task_deliverables_jurisdiction_code_check
  check (
    jurisdiction_code is null
    or jurisdiction_code ~ '^[A-Z]{2}$'
  );

alter table public.task_deliverables
  drop constraint task_deliverables_task_id_version_no_key;

alter table public.task_deliverables
  add constraint task_deliverables_task_jurisdiction_version_key
  unique (task_id, jurisdiction_code, version_no);

create unique index task_deliverables_one_draft_per_jurisdiction_idx
  on public.task_deliverables(task_id, jurisdiction_code)
  where status = 'draft' and jurisdiction_code is not null;

create index task_deliverables_jurisdiction_status_version_idx
  on public.task_deliverables(task_id, jurisdiction_code, status, version_no desc);

create policy "PM staff can delete deliverable zips"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'request-files'
  and (storage.foldername(name))[1] = 'deliverables'
  and public.is_platform_staff()
);
