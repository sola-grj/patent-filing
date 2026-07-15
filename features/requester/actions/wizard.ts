"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult } from "@/lib/validators/requester";
import type {
  WizardPatentCandidate,
  WizardPersistResult,
} from "@/features/requester/wizard-types";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { lookupPatent } from "./patent-lookup";
import { persistWizardRequest } from "./wizard-persistence";
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
    if (!query) throw new Error("Enter a patent number to search.");

    return { success: true, data: { patent: await lookupPatent(query) } };
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
    const submitResult = await persistWizardRequest(formData, "submit");
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
      throw new Error("The preview quote could not be created for negotiation.");
    }

    await startQuoteNegotiation(
      supabase,
      requestId,
      quote.id,
      userId,
      negotiationInput,
      { source: "requester_wizard_preview", quoteId: quote.id },
    );

    revalidatePath("/requester");
    revalidatePath("/requester/requests");
    revalidatePath(`/requester/requests/${requestId}`);
    revalidatePath(`/requester/requests/${requestId}/quote`);
    revalidatePath("/pm");
    revalidatePath("/pm/requests");
    revalidatePath(`/pm/requests/${requestId}`);

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
