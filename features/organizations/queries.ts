import { requirePmContext } from "@/features/pm/server-utils";
import { getRequesterOrganization } from "@/features/requester/server-utils";
import { createServiceClient } from "@/lib/supabase/server";

export async function getSupplierCustomers() {
  const context = await requirePmContext();
  if (context.denied || !context.organization) {
    return { denied: true as const, isAdmin: false, customers: [] };
  }

  const { data, error } = await context.supabase
    .from("customer_supplier_relationships")
    .select(
      "customer_organization_id, started_at, customer:organizations!customer_supplier_relationships_customer_organization_id_fkey(id, name, type, customer_organization_settings(request_sharing_enabled))",
    )
    .eq("supplier_organization_id", context.organization.id)
    .eq("status", "active")
    .order("started_at", { ascending: false });
  if (error) throw new Error(error.message);

  return {
    denied: false as const,
    isAdmin: context.isSupplierAdmin,
    customers: (data ?? []).map((row) => ({
      id: first(row.customer)?.id ?? row.customer_organization_id,
      name: first(row.customer)?.name ?? "Customer organization",
      requestSharingEnabled:
        first(first(row.customer)?.customer_organization_settings)
          ?.request_sharing_enabled ?? false,
      startedAt: row.started_at,
    })),
  };
}

export async function getSupplierCustomer(organizationId: string) {
  const context = await requirePmContext();
  if (context.denied || !context.organization || !context.isSupplierAdmin) {
    return { denied: true as const, customer: null };
  }

  const { data: relationship, error: relationshipError } = await context.supabase
    .from("customer_supplier_relationships")
    .select("customer_organization_id")
    .eq("customer_organization_id", organizationId)
    .eq("supplier_organization_id", context.organization.id)
    .eq("status", "active")
    .maybeSingle();
  if (relationshipError) throw new Error(relationshipError.message);
  if (!relationship) return { denied: true as const, customer: null };

  const service = createServiceClient();
  const { data: erpAccounts, error: erpAccountsError } = await service
    .from("eci_erp_customers")
    .select("client_id, client_name, is_black, auth_user_id, sync_error, last_synced_at")
    .eq("organization_id", organizationId)
    .order("client_name");
  if (erpAccountsError) throw new Error(erpAccountsError.message);

  return {
    denied: false as const,
    customer: await loadOrganization(context.supabase, organizationId),
    erpAccounts: erpAccounts ?? [],
  };
}

export async function getRequesterOrganizationManagement() {
  const context = await getRequesterOrganization();
  if (!context.organization) {
    return { denied: true as const, organization: null, isAdmin: false };
  }

  return {
    denied: false as const,
    organization: await loadOrganization(context.supabase, context.organization.id),
    isAdmin: context.isOrgAdmin,
  };
}

async function loadOrganization(
  supabase: Awaited<ReturnType<typeof getRequesterOrganization>>["supabase"],
  organizationId: string,
) {
  const [organizationResult, membersResult, invitationsResult, settingsResult] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, type")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("organization_members")
        .select("user_id, role, is_org_admin, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("organization_invitations")
        .select("id, email, invited_as_admin, status, expires_at, created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("customer_organization_settings")
        .select("request_sharing_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

  if (organizationResult.error) throw new Error(organizationResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);
  if (invitationsResult.error) throw new Error(invitationsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const userIds = (membersResult.data ?? []).map((member) => member.user_id);
  const { data: profiles, error: profilesError } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds)
    : { data: [], error: null };
  if (profilesError) throw new Error(profilesError.message);
  const profilesById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));

  return {
    ...organizationResult.data,
    requestSharingEnabled: settingsResult.data?.request_sharing_enabled ?? false,
    members: (membersResult.data ?? []).map((member) => ({
      ...member,
      profile: profilesById.get(member.user_id) ?? null,
    })),
    invitations: invitationsResult.data ?? [],
  };
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
