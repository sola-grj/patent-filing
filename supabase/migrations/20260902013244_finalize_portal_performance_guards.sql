create or replace function private.current_authenticated_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then ''
    else lower(coalesce((select auth.jwt() ->> 'email'), ''))
  end;
$$;

revoke all on function private.current_authenticated_email() from public, anon;
grant execute on function private.current_authenticated_email() to authenticated;

drop policy if exists "Organization invitations are visible to managers"
on public.organization_invitations;

create policy "Organization invitations are visible to managers"
on public.organization_invitations
for select
to authenticated
using (
  private.can_manage_customer_org(organization_id)
  or lower(email) = (select private.current_authenticated_email())
);

alter function public.set_updated_at() set search_path = '';
