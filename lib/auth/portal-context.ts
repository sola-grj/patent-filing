import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type PortalOrganization = {
  id: string;
  name: string;
  type: string;
};

export type PortalMembership = {
  id: string;
  organization_id: string;
  role: string;
  organization: PortalOrganization;
  supplier_organization_id: string | null;
  request_sharing_enabled: boolean;
};

type PortalContextPayload = {
  user_id: string;
  effective_role?: EffectiveRole;
  profile?: {
    display_name?: string | null;
    email?: string | null;
    password_setup_required?: boolean;
    platform_role?: "super_admin" | null;
  };
  memberships?: PortalMembership[];
  unread_count?: number;
};

export type PortalContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
  displayName: string | null;
  passwordSetupRequired: boolean;
  memberships: PortalMembership[];
  requesterMembership: PortalMembership | null;
  staffMembership: PortalMembership | null;
  unreadCount: number;
  effectiveRole: EffectiveRole;
  isSuperAdmin: boolean;
};

export type EffectiveRole = "requester" | "requester_admin" | "pm" | "pm_admin" | "super_admin";
const staffRoles = new Set(["pm", "pm_admin"]);

export const getOptionalPortalContext = cache(async (): Promise<PortalContext | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_portal_context");
  if (error) {
    if (error.code === "42501") return null;
    throw new Error(error.message);
  }

  const payload = (data ?? {}) as PortalContextPayload;
  if (!payload.user_id) return null;
  const memberships = payload.memberships ?? [];
  const requesterMembership = memberships.find((membership) =>
    ["requester", "requester_admin"].includes(membership.role) && membership.organization?.type === "customer"
  ) ?? null;
  const staffMembership = memberships.find((membership) =>
    staffRoles.has(membership.role) && membership.organization?.type === "supplier"
  ) ?? null;

  return {
    supabase,
    userId: payload.user_id,
    email: payload.profile?.email ?? null,
    displayName: payload.profile?.display_name ?? null,
    passwordSetupRequired: payload.profile?.password_setup_required ?? false,
    memberships,
    requesterMembership,
    staffMembership,
    unreadCount: Number(payload.unread_count ?? 0),
    effectiveRole: payload.effective_role ?? "requester",
    isSuperAdmin: payload.profile?.platform_role === "super_admin",
  };
});

export async function requirePortalContext() {
  const context = await getOptionalPortalContext();
  if (!context) {
    redirect("/auth/login");
  }
  return context;
}
