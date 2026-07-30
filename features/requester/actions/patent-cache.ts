"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/validators/requester";
import type { WizardPayload } from "@/features/requester/wizard-types";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { ensureSubmittedPatentFileReady } from "./patent-file-readiness";

export async function retrySubmittedPatentCache(
  requestId: string,
): Promise<ActionResult<{ status: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const { data: request, error } = await supabase
      .from("translation_requests")
      .select("id, requester_id, submitted_at, source_mode, draft_payload")
      .eq("id", requestId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (
      !request
      || request.requester_id !== userId
      || !request.submitted_at
      || request.source_mode !== "patent_search"
    ) {
      throw new Error("This submitted patent Request is not available.");
    }
    const payload = request.draft_payload as WizardPayload | null;
    const lookupReceipt = payload?.selectedPatent?.lookupReceipt;
    const analysisReceipt = payload?.analysis?.analysis_receipt;
    if (!lookupReceipt || !analysisReceipt) {
      throw new Error(
        "Verified patent data is unavailable. Search the patent again to create a new Request.",
      );
    }
    await ensureSubmittedPatentFileReady({
      supabase,
      requestId,
      lookupReceipt,
      analysisReceipt,
    });
    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true, data: { status: "completed" } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
