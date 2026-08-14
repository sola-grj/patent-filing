create or replace function public.admin_create_organization_invitation(
  target_organization_id uuid,
  target_email text,
  target_token_hash text,
  target_is_admin boolean,
  target_expires_at timestamptz,
  actor_user_id uuid
)
returns public.organization_invitations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  invitation public.organization_invitations;
  normalized_email text := lower(trim(target_email));
  actor_authorized boolean;
begin
  if normalized_email = '' then
    raise exception 'Invitation email is required.';
  end if;

  if target_expires_at <= now() then
    raise exception 'Invitation expiration must be in the future.';
  end if;

  select (
    exists (
      select 1
      from public.organization_members member
      join public.organizations customer on customer.id = member.organization_id
      where member.user_id = actor_user_id
        and member.organization_id = target_organization_id
        and member.role = 'requester'
        and member.is_org_admin
        and customer.type = 'customer'
    )
    or exists (
      select 1
      from public.organization_members member
      join public.organizations supplier on supplier.id = member.organization_id
      join public.customer_supplier_relationships relationship
        on relationship.supplier_organization_id = supplier.id
       and relationship.customer_organization_id = target_organization_id
       and relationship.status = 'active'
      where member.user_id = actor_user_id
        and member.role = 'admin'
        and supplier.type = 'supplier'
    )
  ) into actor_authorized;

  if not coalesce(actor_authorized, false) then
    raise exception 'You cannot invite members to this organization.';
  end if;

  if exists (
    select 1
    from public.organization_members member
    join public.profiles profile on profile.user_id = member.user_id
    where member.organization_id = target_organization_id
      and lower(profile.email) = normalized_email
  ) then
    raise exception 'This user is already a member of the organization.';
  end if;

  perform 1
  from public.organizations
  where id = target_organization_id
  for update;

  update public.organization_invitations
  set
    status = case
      when expires_at <= now() then 'expired'::public.organization_invitation_status
      else 'revoked'::public.organization_invitation_status
    end,
    revoked_at = case
      when expires_at > now() then now()
      else null
    end,
    updated_at = now()
  where organization_id = target_organization_id
    and lower(email) = normalized_email
    and status = 'pending';

  insert into public.organization_invitations (
    organization_id,
    email,
    token_hash,
    invited_as_admin,
    invited_by,
    expires_at
  ) values (
    target_organization_id,
    normalized_email,
    target_token_hash,
    target_is_admin,
    actor_user_id,
    target_expires_at
  )
  returning * into invitation;

  insert into public.organization_audit_events (
    organization_id,
    actor_id,
    event_type,
    payload
  ) values (
    target_organization_id,
    actor_user_id,
    'organization_invitation.created',
    jsonb_build_object(
      'invitation_id', invitation.id,
      'email', normalized_email,
      'invited_as_admin', target_is_admin,
      'expires_at', target_expires_at
    )
  );

  return invitation;
end;
$$;

revoke all on function public.admin_create_organization_invitation(
  uuid,
  text,
  text,
  boolean,
  timestamptz,
  uuid
) from public, anon, authenticated;

grant execute on function public.admin_create_organization_invitation(
  uuid,
  text,
  text,
  boolean,
  timestamptz,
  uuid
) to service_role;
