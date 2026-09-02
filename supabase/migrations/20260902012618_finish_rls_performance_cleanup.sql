drop policy if exists "Organization invitations are visible to managers" on public.organization_invitations;
create policy "Organization invitations are visible to managers"
on public.organization_invitations for select to authenticated
using (
  private.can_manage_customer_org(organization_id)
  or lower(email) = (select lower(coalesce(auth.jwt() ->> 'email', '')))
);

drop policy if exists "Glossaries are managed by customer admins or supplier admins" on public.terminology_glossaries;
create policy "Glossaries are inserted by customer or supplier admins" on public.terminology_glossaries
for insert to authenticated with check (private.can_manage_customer_org(organization_id));
create policy "Glossaries are updated by customer or supplier admins" on public.terminology_glossaries
for update to authenticated using (private.can_manage_customer_org(organization_id))
with check (private.can_manage_customer_org(organization_id));
create policy "Glossaries are deleted by customer or supplier admins" on public.terminology_glossaries
for delete to authenticated using (private.can_manage_customer_org(organization_id));

drop policy if exists "Terminology entries follow glossary manage access" on public.terminology_entries;
create policy "Terminology entries follow glossary insert access" on public.terminology_entries
for insert to authenticated with check (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id and private.can_manage_customer_org(glossary.organization_id)
));
create policy "Terminology entries follow glossary update access" on public.terminology_entries
for update to authenticated using (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id and private.can_manage_customer_org(glossary.organization_id)
)) with check (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id and private.can_manage_customer_org(glossary.organization_id)
));
create policy "Terminology entries follow glossary delete access" on public.terminology_entries
for delete to authenticated using (exists (
  select 1 from public.terminology_glossaries glossary
  where glossary.id = glossary_id and private.can_manage_customer_org(glossary.organization_id)
));

drop policy if exists "Pricing rule sets are managed by supplier admins" on public.pricing_rule_sets;
create policy "Pricing rule sets are inserted by supplier admins" on public.pricing_rule_sets
for insert to authenticated with check (
  private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[])
);
create policy "Pricing rule sets are updated by supplier admins" on public.pricing_rule_sets
for update to authenticated using (
  private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[])
) with check (
  private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[])
);
create policy "Pricing rule sets are deleted by supplier admins" on public.pricing_rule_sets
for delete to authenticated using (
  private.is_supplier_member(supplier_organization_id, array['admin']::public.organization_role[])
);

drop policy if exists "Pricing rules are managed by supplier admins" on public.pricing_rules;
create policy "Pricing rules are inserted by supplier admins" on public.pricing_rules
for insert to authenticated with check (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(rule_set.supplier_organization_id, array['admin']::public.organization_role[])
));
create policy "Pricing rules are updated by supplier admins" on public.pricing_rules
for update to authenticated using (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(rule_set.supplier_organization_id, array['admin']::public.organization_role[])
)) with check (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(rule_set.supplier_organization_id, array['admin']::public.organization_role[])
));
create policy "Pricing rules are deleted by supplier admins" on public.pricing_rules
for delete to authenticated using (exists (
  select 1 from public.pricing_rule_sets rule_set
  where rule_set.id = rule_set_id
    and private.is_supplier_member(rule_set.supplier_organization_id, array['admin']::public.organization_role[])
));
