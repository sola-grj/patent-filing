"use server";

import type { ActionResult } from "@/lib/validators/requester";

export async function initializeRequesterWorkspace(
  formData: FormData,
): Promise<ActionResult> {
  void formData;
  return {
    success: false,
    error: "Organization setup is invitation only. Contact your ECI administrator.",
  };
}
