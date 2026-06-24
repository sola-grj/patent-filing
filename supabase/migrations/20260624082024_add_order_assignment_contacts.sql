create or replace function public.get_order_assignment_contacts(target_order_id uuid)
returns table (
  pm_names text,
  linguist_names text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pm_contacts.pm_names,
    linguist_contacts.linguist_names
  from public.orders ord
  left join lateral (
    select string_agg(
      distinct coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_pm_id::text),
      ', '
      order by coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_pm_id::text)
    ) as pm_names
    from public.translation_tasks task
    left join public.profiles profile on profile.user_id = task.assigned_pm_id
    where task.order_id = ord.id
      and task.assigned_pm_id is not null
  ) pm_contacts on true
  left join lateral (
    select string_agg(
      distinct coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_translator_id::text),
      ', '
      order by coalesce(nullif(profile.display_name, ''), nullif(profile.email, ''), task.assigned_translator_id::text)
    ) as linguist_names
    from public.translation_tasks task
    left join public.profiles profile on profile.user_id = task.assigned_translator_id
    where task.order_id = ord.id
      and task.assigned_translator_id is not null
  ) linguist_contacts on true
  where ord.id = target_order_id
    and (select auth.uid()) is not null
    and public.can_access_order(ord.id);
$$;
