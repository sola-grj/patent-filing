drop policy if exists "Requests can be updated by participants"
  on public.translation_requests;

create policy "Requests can be updated by participants"
  on public.translation_requests
  for update
  to authenticated
  using (public.can_access_request(id))
  with check (
    (
      requester_id = (select auth.uid())
      and public.is_org_member(organization_id)
    )
    or public.is_platform_staff()
  );
