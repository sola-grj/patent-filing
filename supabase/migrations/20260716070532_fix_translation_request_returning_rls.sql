drop policy if exists "Requests are visible to participants"
  on public.translation_requests;

create policy "Requests are visible to participants"
  on public.translation_requests
  for select
  to authenticated
  using (
    translation_requests.requester_id = (select auth.uid())
    or public.is_org_member(translation_requests.organization_id)
    or public.is_platform_staff()
  );
