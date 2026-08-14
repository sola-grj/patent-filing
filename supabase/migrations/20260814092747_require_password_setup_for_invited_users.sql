alter table public.profiles
add column password_setup_required boolean not null default false;

update public.profiles profile
set password_setup_required = true,
    updated_at = now()
where exists (
  select 1
  from public.organization_invitations invitation
  where invitation.accepted_by = profile.user_id
    and invitation.status = 'accepted'
);

create or replace function public.admin_accept_organization_invitation(
  target_token_hash text,
  target_user_id uuid,
  target_email text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  auth_email text := lower(trim(target_email));
  profile_already_exists boolean;
begin
  if target_user_id is null or auth_email is null or auth_email = '' then
    raise exception 'The authenticated email does not match the invitation.';
  end if;

  select *
  into invitation
  from public.organization_invitations
  where token_hash = target_token_hash
  for update;

  if invitation.id is null then
    raise exception 'Invitation not found.';
  end if;

  if invitation.status <> 'pending' then
    raise exception 'This invitation is no longer available.';
  end if;

  if invitation.expires_at <= now() then
    update public.organization_invitations
    set status = 'expired', updated_at = now()
    where id = invitation.id;
    raise exception 'This invitation has expired.';
  end if;

  if lower(invitation.email) <> auth_email then
    raise exception 'The authenticated email does not match the invitation.';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join public.organizations organization on organization.id = member.organization_id
    where member.user_id = target_user_id
      and member.role = 'requester'
      and organization.type = 'customer'
      and member.organization_id <> invitation.organization_id
  ) then
    raise exception 'This account already belongs to another customer organization.';
  end if;

  select exists (
    select 1
    from public.profiles profile
    where profile.user_id = target_user_id
  ) into profile_already_exists;

  insert into public.profiles (
    user_id,
    email,
    password_setup_required
  ) values (
    target_user_id,
    auth_email,
    not profile_already_exists
  )
  on conflict (user_id) do update
  set email = excluded.email,
      updated_at = now();

  insert into public.organization_members (
    organization_id,
    user_id,
    role,
    is_org_admin
  ) values (
    invitation.organization_id,
    target_user_id,
    'requester',
    invitation.invited_as_admin
  );

  update public.organization_invitations
  set status = 'accepted',
      accepted_by = target_user_id,
      accepted_at = now(),
      updated_at = now()
  where id = invitation.id;

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    invitation.organization_id,
    target_user_id,
    'organization_invitation.accepted',
    jsonb_build_object('invitation_id', invitation.id, 'email', auth_email)
  );

  return invitation.organization_id;
end;
$$;

revoke all on function public.admin_accept_organization_invitation(text, uuid, text)
from public, anon, authenticated;

grant execute on function public.admin_accept_organization_invitation(text, uuid, text)
to service_role;
