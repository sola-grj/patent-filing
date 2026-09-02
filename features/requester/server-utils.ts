import { requirePortalContext } from "@/lib/auth/portal-context";

export async function getAuthenticatedUser() {
  const context = await requirePortalContext();
  return {
    supabase: context.supabase,
    userId: context.userId,
    email: context.email,
  };
}

export async function getRequesterOrganization() {
  const context = await requirePortalContext();
  const membership = context.requesterMembership;
  const organization = membership?.organization ?? null;

  return {
    supabase: context.supabase,
    userId: context.userId,
    email: context.email,
    organization,
    membership,
    supplierOrganizationId: membership?.supplier_organization_id ?? null,
    requestSharingEnabled: membership?.request_sharing_enabled ?? false,
    isOrgAdmin: membership?.is_org_admin ?? false,
  };
}

export function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}

export function safeFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
}
