drop policy if exists "Requests can be created by org members"
  on public.translation_requests;

create policy "Requests can be created by requester organization members"
  on public.translation_requests
  for insert
  to authenticated
  with check (
    (
      translation_requests.requester_id = (select auth.uid())
      and exists (
        select 1
        from public.organization_members member
        where member.organization_id = translation_requests.organization_id
          and member.user_id = (select auth.uid())
          and member.role = 'requester'::public.organization_role
      )
    )
    or public.is_platform_staff()
  );
