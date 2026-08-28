create policy "Requesters can delete their own drafts"
on public.translation_requests
for delete
to authenticated
using (
  requester_id = (select auth.uid())
  and workflow_stage = 'draft'
);
