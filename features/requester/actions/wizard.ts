"use server";

import { type ActionResult } from "@/lib/validators/requester";
import type {
  WizardPatentCandidate,
  WizardPersistResult,
} from "@/features/requester/wizard-types";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { mockPatentCandidates } from "./wizard-mocks";
import { persistWizardRequest } from "./wizard-persistence";

export async function searchPatentCandidates(
  formData: FormData,
): Promise<ActionResult<{ candidates: WizardPatentCandidate[] }>> {
  try {
    await getAuthenticatedUser();
    const query = String(formData.get("patentQuery") ?? "").trim();
    if (!query) throw new Error("Enter a patent number to search.");

    return { success: true, data: { candidates: mockPatentCandidates(query) } };
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
  return persistWizardRequest(formData, "negotiate");
}
