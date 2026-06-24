import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const staffRoles = ["pm", "ops", "admin"] as const;
export type StaffRole = (typeof staffRoles)[number];

export async function getPmContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/auth/login");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, type)")
    .eq("user_id", claims.sub);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const staffMembership = (memberships ?? []).find((membership) =>
    staffRoles.includes(membership.role as StaffRole),
  );
  const organization = Array.isArray(staffMembership?.organizations)
    ? staffMembership?.organizations[0]
    : staffMembership?.organizations;

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    organization: organization ?? null,
    membership: staffMembership ?? null,
    isStaff: Boolean(staffMembership),
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
