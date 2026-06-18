import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function getAuthenticatedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    redirect("/auth/login");
  }

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

export async function getRequesterOrganization() {
  const { supabase, userId, email } = await getAuthenticatedUser();
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, type)")
    .eq("user_id", userId)
    .eq("role", "requester")
    .limit(1)
    .maybeSingle();

  const organization = Array.isArray(data?.organizations)
    ? data?.organizations[0]
    : data?.organizations;

  return {
    supabase,
    userId,
    email,
    organization: organization ?? null,
    membership: data ?? null,
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
