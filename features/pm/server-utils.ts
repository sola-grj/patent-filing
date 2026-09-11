import { requirePortalContext } from "@/lib/auth/portal-context";

export const staffRoles = ["pm", "pm_admin", "super_admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export async function getPmContext() {
  const portalContext = await requirePortalContext();
  const staffMembership = portalContext.staffMembership;
  const organization = staffMembership?.organization ?? null;

  return {
    supabase: portalContext.supabase,
    userId: portalContext.userId,
    email: portalContext.email,
    organization,
    membership: staffMembership,
    effectiveRole: portalContext.effectiveRole,
    isStaff: Boolean(staffMembership) || portalContext.isSuperAdmin,
    isPm: staffMembership?.role === "pm" && !portalContext.isSuperAdmin,
    isSupplierAdmin: staffMembership?.role === "pm_admin" || portalContext.isSuperAdmin,
    isSuperAdmin: portalContext.isSuperAdmin,
  };
}

export async function requirePmContext() {
  const context = await getPmContext();

  if (!context.isStaff) {
    return { ...context, denied: true as const };
  }

  return { ...context, denied: false as const };
}

export function toPmErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong.";
}
