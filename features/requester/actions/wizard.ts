"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { type ActionResult } from "@/lib/validators/requester";
import type {
  WizardPatentCandidate,
  WizardPersistResult,
  WizardPayload,
} from "@/features/requester/wizard-types";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { lookupPatent } from "./patent-lookup";
import { patentNumberErrorForPath } from "@/features/requester/patent-number-validation";
import { patentSourceForChannel } from "@/features/requester/patent-source";
import { persistWizardRequest } from "./wizard-persistence";
import { enqueueSubmittedPatentFilePreparation } from "./patent-file-readiness";
import { writeRequestEvent } from "./helpers";
import {
  parseQuoteNegotiationInput,
  startQuoteNegotiation,
} from "./quote-negotiation";

export async function lookupPatentForWizard(
  formData: FormData,
): Promise<ActionResult<{ patent: WizardPatentCandidate }>> {
  try {
    await getAuthenticatedUser();
    const query = String(formData.get("patentQuery") ?? "").trim();
    const channelCode = String(formData.get("channelCode") ?? "").trim();
    if (!query) throw new Error("Enter a patent number to search.");
    const validationError = patentNumberErrorForPath(channelCode, query);
    if (validationError) throw new Error(validationError);

    return {
      success: true,
      data: {
        patent: await lookupPatent(query, patentSourceForChannel(channelCode)),
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveRequestDraft(
  formData: FormData,
): Promise<ActionResult<WizardPersistResult>> {
  return persistWizardRequest(formData, "draft");
}

export async function submitRequestFromWizard(
  formData: FormData,
): Promise<ActionResult<WizardPersistResult>> {
  return persistWizardRequest(formData, "submit");
}

export async function submitNegotiationFromWizard(
  formData: FormData,
): Promise<ActionResult<WizardPersistResult>> {
  try {
    const wizardPayload = JSON.parse(
      String(formData.get("payload") ?? "{}"),
    ) as WizardPayload;
    const sourceMode = wizardPayload.sourceMode;
    const submitResult = await persistWizardRequest(
      formData,
      "submit",
      {
        deferPatentCache: true,
        deferFormalSubmission: true,
      },
    );
    if (!submitResult.success || !submitResult.data?.requestId) {
      return submitResult;
    }

    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = submitResult.data.requestId;
    const negotiationInput = parseQuoteNegotiationInput(formData);

    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select("id")
      .eq("request_id", requestId)
      .eq("status", "accepted")
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (quoteError) {
      throw new Error(quoteError.message);
    }

    if (!quote) {
      throw new Error("The ECI ERP quote could not be created for negotiation.");
    }

    await startQuoteNegotiation(
      supabase,
      requestId,
      quote.id,
      userId,
      negotiationInput,
      { source: "eci_erp", quoteId: quote.id },
    );
    const submittedAt = new Date().toISOString();
    const { error: finalizeError } = await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "quoted",
        requester_status: "responding",
        pm_status: "responding",
        submitted_at: submittedAt,
      })
      .eq("id", requestId)
      .is("submitted_at", null);
    if (finalizeError) {
      throw new Error(`Unable to finalize translation request: ${finalizeError.message}`);
    }
    await writeRequestEvent(
      supabase,
      requestId,
      userId,
      "request.submitted.from_wizard",
      "draft",
      "quoted",
      { sourceMode, negotiation: true },
    );
    if (sourceMode === "patent_search" || sourceMode === "upload") {
      const lookupReceipt = wizardPayload.selectedPatent?.lookupReceipt;
      const analysisReceipt = wizardPayload.analysis?.analysis_receipt;
      after(async () => {
        try {
          if (!analysisReceipt || (sourceMode === "patent_search" && !lookupReceipt)) {
            throw new Error("Verified patent data is unavailable.");
          }
          await enqueueSubmittedPatentFilePreparation({
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
            "quoted",
            "quoted",
            {
              message: cacheError instanceof Error
                ? cacheError.message
                : "Patent cache preparation failed.",
              retryable: true,
            },
          ).catch(() => undefined);
        }
      });
    }

    revalidatePath("/requester");
    revalidatePath("/requester/requests");
    revalidatePath(`/requester/requests/${requestId}`);
    revalidatePath(`/requester/requests/${requestId}/quote`);
    revalidatePath("/pm");
    revalidatePath(`/pm/${requestId}`);

    return {
      success: true,
      data: {
        requestId,
        requestNo: submitResult.data.requestNo,
      },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}
