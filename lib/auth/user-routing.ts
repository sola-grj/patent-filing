import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

const PM_LANDING_ROLES = new Set(["pm", "ops", "admin"]);

export type AppLandingPath = "/pm" | "/requester";

type AuthenticatedUser = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  email: string | null;
};

export async function getOptionalAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (error || !claims?.sub) {
    return null;
  }

  return {
    supabase,
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
  };
}

export async function requireAuthenticatedUser() {
  const user = await getOptionalAuthenticatedUser();

  if (!user) {
    redirect("/auth/login");
  }

  return user;
}

export function resolveLandingPath(
  roles: Array<string | null | undefined>,
): AppLandingPath {
  if (roles.some((role) => role && PM_LANDING_ROLES.has(role))) {
    return "/pm";
  }

  return "/requester";
}

export async function getLandingPathForUser(
  userId: string,
  supabaseClient?: Awaited<ReturnType<typeof createClient>>,
) {
  const supabase = supabaseClient ?? (await createClient());
  const { data, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  return resolveLandingPath((data ?? []).map((membership) => membership.role));
}
