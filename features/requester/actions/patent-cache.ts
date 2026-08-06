"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/validators/requester";
import type { WizardPayload } from "@/features/requester/wizard-types";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { enqueueSubmittedPatentFilePreparation } from "./patent-file-readiness";
import { writeRequestEvent } from "./helpers";

export async function retrySubmittedPatentCache(
  requestId: string,
): Promise<ActionResult<{ status: string }>> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const { data: request, error } = await supabase
      .from("translation_requests")
      .select("id, requester_id, submitted_at, source_mode, draft_payload, requester_status")
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
    let accepted;
    try {
      accepted = await enqueueSubmittedPatentFilePreparation({
        supabase,
        requestId,
        lookupReceipt,
        analysisReceipt,
      });
    } catch (cacheError) {
      await writeRequestEvent(
        supabase,
        requestId,
        userId,
        "patent.cache.prepare_failed",
        request.requester_status,
        request.requester_status,
        {
          message: cacheError instanceof Error
            ? cacheError.message
            : "Patent cache preparation failed.",
          retryable: true,
          trigger: "manual_retry",
        },
      ).catch(() => undefined);
      throw cacheError;
    }
    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true, data: { status: accepted.status } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
