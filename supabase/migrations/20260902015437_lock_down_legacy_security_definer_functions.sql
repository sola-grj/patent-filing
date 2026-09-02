revoke all on function public.get_order_assignment_contacts(uuid) from public, anon;
grant execute on function public.get_order_assignment_contacts(uuid) to authenticated;

revoke all on function public.has_org_role(uuid, public.organization_role[]) from public, anon;
grant execute on function public.has_org_role(uuid, public.organization_role[]) to authenticated;

revoke all on function public.is_org_member(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
