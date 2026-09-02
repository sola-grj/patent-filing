"use server";

import type { WizardConfig, WizardPayload } from "@/features/requester/wizard-types";
import {
  availableErpCountries,
  publicQuote,
  quoteForOrganization,
} from "@/lib/eci-erp/pricing";
import type { ErpActionResult, ErpCountry, SignedQuoteEstimate } from "@/lib/eci-erp/types";

import { getRequesterOrganization, toErrorMessage } from "../server-utils";
import { verifyWizardPatentPayload } from "./patent-service";
import {
  isEpGrantingTranslation,
  isVerifiedCustomerTifg,
} from "../epo-tifg-upload";
import { signQuoteEstimate } from "./quote-receipt";

export async function loadErpCountriesForWizard(
  config: Pick<WizardConfig, "channelCode" | "serviceTypes" | "epvType" | "epServiceType">,
): Promise<ErpActionResult<ErpCountry[]>> {
  await getRequesterOrganization();
  return availableErpCountries(config);
}

export async function generateErpEstimate(
  payload: WizardPayload,
): Promise<ErpActionResult<SignedQuoteEstimate>> {
  try {
    const { organization, userId, supabase } = await getRequesterOrganization();
    if (!organization) throw new Error("Your account is not linked to a customer organization.");
    const usesStoredPatent = await hasVerifiedStoredDraftPatent(
      supabase,
      userId,
      payload,
    );
    const verifiedPayload = usesStoredPatent
      ? payload
      : await verifyWizardPatentPayload(payload);
    const result = await quoteForOrganization(verifiedPayload, organization.id, userId);
    const quote = publicQuote(result);
    return {
      success: true,
      data: signQuoteEstimate({
        userId,
        organizationId: organization.id,
        payload,
        quote,
      }),
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

async function hasVerifiedStoredDraftPatent(
  supabase: Awaited<ReturnType<typeof getRequesterOrganization>>["supabase"],
  userId: string,
  payload: WizardPayload,
) {
  if (
    !payload.requestId
    || payload.sourceMode !== "patent_search"
    || payload.selectedPatent?.lookupReceipt
    || payload.analysis?.analysis_receipt
  ) {
    return false;
  }

  const { data: request, error: requestError } = await supabase
    .from("translation_requests")
    .select("id")
    .eq("id", payload.requestId)
    .eq("requester_id", userId)
    .eq("workflow_stage", "draft")
    .eq("source_mode", "patent_search")
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) return false;

  if (isEpGrantingTranslation(payload.config)) {
    return hasVerifiedStoredDraftTifg(supabase, payload);
  }

  if (!payload.analysis || !["success", "partial"].includes(payload.analysis.status)) {
    return false;
  }

  const { data: patent, error: patentError } = await supabase
    .from("request_patents")
    .select("patent_number")
    .eq("request_id", payload.requestId)
    .maybeSingle();
  if (patentError) throw new Error(patentError.message);
  return patent?.patent_number === payload.selectedPatent?.patentNumber
    && payload.analysis.restored_from_storage === true;
}

async function hasVerifiedStoredDraftTifg(
  supabase: Awaited<ReturnType<typeof getRequesterOrganization>>["supabase"],
  payload: WizardPayload,
) {
  if (!isVerifiedCustomerTifg(payload.analysis)) return false;

  const { data: files, error: filesError } = await supabase
    .from("request_files")
    .select("id")
    .eq("request_id", payload.requestId)
    .eq("source", "upload")
    .eq("status", "parsed");
  if (filesError) throw new Error(filesError.message);
  if (!files?.length) return false;

  const { data: results, error: resultsError } = await supabase
    .from("file_parse_results")
    .select("file_id")
    .in("file_id", files.map((file) => file.id))
    .eq("retrieval_mode", "customer_upload")
    .in("parse_status", ["completed", "needs_review"]);
  if (resultsError) throw new Error(resultsError.message);
  return Boolean(results?.length);
}
