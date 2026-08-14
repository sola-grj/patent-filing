"use server";

import { getAuthenticatedUser } from "@/features/requester/server-utils";

export type UpdatePasswordResult =
  | { success: true }
  | { success: false; message: string };

export async function updateAuthenticatedUserPassword(
  password: string,
): Promise<UpdatePasswordResult> {
  try {
    if (typeof password !== "string" || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const { supabase, userId } = await getAuthenticatedUser();
    const { error: passwordError } = await supabase.auth.updateUser({ password });
    if (passwordError) throw new Error(passwordError.message);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ password_setup_required: false })
      .eq("user_id", userId);
    if (profileError) throw new Error(profileError.message);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unable to update password.",
    };
  }
}
