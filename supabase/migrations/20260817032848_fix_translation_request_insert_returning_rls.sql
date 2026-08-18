drop policy if exists "Requests follow scoped read access"
on public.translation_requests;

create policy "Requests follow scoped read access"
on public.translation_requests for select to authenticated
using (
  requester_id = (select auth.uid())
  or (
    workflow_stage <> 'draft'
    and private.is_supplier_member(supplier_organization_id)
  )
  or (
    workflow_stage <> 'draft'
    and private.is_customer_member(organization_id)
    and exists (
      select 1
      from public.customer_organization_settings settings
      where settings.organization_id = translation_requests.organization_id
        and settings.request_sharing_enabled
    )
  )
);

drop policy if exists "Requesters can create assigned requests"
on public.translation_requests;

create policy "Requesters can create assigned requests"
on public.translation_requests for insert to authenticated
with check (
  requester_id = (select auth.uid())
  and private.is_customer_member(organization_id)
  and exists (
    select 1
    from public.customer_supplier_relationships relationship
    where relationship.customer_organization_id = translation_requests.organization_id
      and relationship.supplier_organization_id = translation_requests.supplier_organization_id
      and relationship.status = 'active'
  )
);
