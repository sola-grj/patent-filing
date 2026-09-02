"use server";

import { createServiceClient, createClient } from "@/lib/supabase/server";
import { refreshErpToken } from "@/lib/eci-erp/client";
import { normalizeLogin } from "@/lib/eci-erp/pricing-rules";
import { after } from "next/server";

const LOGIN_ERROR = "Invalid login credentials.";

export async function loginWithEmailOrClientName(input: {
  login: string;
  password: string;
}) {
  try {
    const login = input.login.trim();
    if (!login || !input.password) return { success: false, error: LOGIN_ERROR };
    const email = login.includes("@") ? login.toLowerCase() : await resolveClientEmail(login);
    if (!email) return { success: false, error: LOGIN_ERROR };

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (error) return { success: false, error: LOGIN_ERROR };
    after(prepareErpTokenCache);
    return { success: true };
  } catch {
    return { success: false, error: LOGIN_ERROR };
  }
}

async function prepareErpTokenCache() {
  try {
    await refreshErpToken();
  } catch {
    // ERP availability must not turn a successful Portal authentication into
    // a misleading invalid-credentials response. ERP actions surface their
    // own integration error if the cache could not be prepared.
    console.error("[ECI ERP] Token refresh failed after Portal login.");
  }
}

async function resolveClientEmail(clientName: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("eci_erp_customers")
    .select("auth_user_id")
    .eq("normalized_login", normalizeLogin(clientName))
    .eq("is_black", false)
    .is("sync_error", null);
  if (error || data?.length !== 1 || !data[0].auth_user_id) return null;
  const { data: authData, error: authError } = await service.auth.admin.getUserById(
    data[0].auth_user_id,
  );
  return authError ? null : authData.user?.email ?? null;
}
