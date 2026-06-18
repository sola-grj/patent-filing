"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requiredString, type ActionResult } from "@/lib/validators/requester";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";

export async function initializeRequesterWorkspace(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId, email } = await getAuthenticatedUser();
    const organizationName = requiredString(
      formData.get("organizationName"),
      "Organization name",
    );
    const displayName = requiredString(formData.get("displayName"), "Display name");

    await supabase.from("profiles").upsert({
      user_id: userId,
      email,
      display_name: displayName,
    });

    const organizationId = randomUUID();
    const { error: orgError } = await supabase
      .from("organizations")
      .insert({ id: organizationId, name: organizationName, type: "customer" });

    if (orgError) throw new Error(orgError.message);

    const { error: memberError } = await supabase.from("organization_members").insert({
      organization_id: organizationId,
      user_id: userId,
      role: "requester",
    });

    if (memberError) throw new Error(memberError.message);

    revalidatePath("/requester");
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
