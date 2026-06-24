drop policy if exists "Orders can be created by staff" on public.orders;
create policy "Orders can be created by staff"
on public.orders
for insert
with check (
  (select auth.uid()) is not null
  and (select public.is_platform_staff())
);

drop policy if exists "PM staff can create started orders from accepted quotes" on public.orders;
create policy "PM staff can create started orders from accepted quotes"
on public.orders
for insert
with check (
  (select auth.uid()) is not null
  and (select public.is_platform_staff())
  and status = 'in_progress'
  and offline_confirmation_status = 'confirmed'
  and exists (
    select 1
    from public.translation_requests request
    join public.quotes quote
      on quote.id = orders.accepted_quote_id
      and quote.request_id = request.id
    where request.id = orders.request_id
      and request.organization_id = orders.organization_id
      and request.requester_id = orders.requester_id
      and quote.status = 'accepted'
  )
);
