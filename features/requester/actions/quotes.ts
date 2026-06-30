"use server";

import { revalidatePath } from "next/cache";

import {
  optionalString,
  requiredString,
  validateFutureDateString,
  type ActionResult,
} from "@/lib/validators/requester";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { nextVersion, sumParseMetric, writeRequestEvent } from "./helpers";
import {
  parseQuoteNegotiationInput,
  startQuoteNegotiation,
} from "./quote-negotiation";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];
const DEFAULT_DELIVERY_OPTION = "standard";
type SelectedRequestFile = { id: string; file_parse_results?: unknown };
type QuoteSeed = {
  amount: number;
  currency: string;
  estimatedDeliveryAt: string | null;
  label: string;
  notes: string;
  requestId: string;
  source: string;
};

export async function saveTranslationConfig(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const requirementInput = buildRequirementInput(requestId, formData);
    const { data: requirement, error: requirementError } = await supabase
      .from("translation_requirements")
      .upsert(requirementInput, { onConflict: "request_id" })
      .select("id")
      .single();

    if (requirementError) throw new Error(requirementError.message);

    const configId = await createConfigVersion(supabase, requestId, requirement.id, requirementInput, userId);
    const files = await selectedRequestFiles(supabase, requestId);
    await supabase.from("request_config_files").insert(
      files.map((file) => ({ config_version_id: configId, request_file_id: file.id })),
    );

    await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "configured",
        requester_status: "responding",
        pm_status: "responding",
      })
      .eq("id", requestId);
    await writeRequestEvent(supabase, requestId, userId, "request.configured", "parsing", "configured");

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function saveTranslationConfigAndGenerateQuote(formData: FormData): Promise<ActionResult> {
  return saveTranslationConfig(formData);
}

export async function acceptQuote(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const { data: request, error: requestError } = await supabase
      .from("translation_requests")
      .select("workflow_stage")
      .eq("id", requestId)
      .single();

    if (requestError) {
      throw new Error(requestError.message);
    }

    await supabase
      .from("quotes")
      .update({ status: "superseded" })
      .eq("request_id", requestId)
      .eq("status", "accepted")
      .neq("id", quoteId);

    await supabase.from("quotes").update({ status: "accepted" }).eq("id", quoteId);
    await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "quoted",
        requester_status: "responding",
        pm_status: "responding",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      supabase,
      requestId,
      userId,
      "quote.accepted",
      request.workflow_stage ?? "quoted",
      "quoted",
      { quoteId },
    );

    revalidatePath(`/requester/requests/${requestId}`);
    revalidatePath(`/requester/requests/${requestId}/quote`);
    revalidatePath("/requester");
    revalidatePath("/requester/requests");
    revalidatePath("/pm");
    revalidatePath("/pm/requests");
    revalidatePath(`/pm/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function acceptPmNegotiationQuote(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const negotiationId = requiredString(
      formData.get("negotiationId"),
      "Negotiation",
    );
    const { data: request, error: requestError } = await supabase
      .from("translation_requests")
      .select("workflow_stage")
      .eq("id", requestId)
      .single();

    if (requestError) {
      throw new Error(requestError.message);
    }

    const { data: sourceQuote, error: quoteError } = await supabase
      .from("quotes")
      .select(
        "id, request_id, currency, total_amount, estimated_delivery_at, quote_items(label, description)",
      )
      .eq("id", quoteId)
      .single();

    if (quoteError) {
      throw new Error(quoteError.message);
    }
    if (sourceQuote.request_id !== requestId) {
      throw new Error("Quote does not belong to this request.");
    }

    const { data: negotiation, error: negotiationError } = await supabase
      .from("quote_negotiations")
      .select(
        "id, request_id, quote_id, initiated_by, expected_amount, expected_delivery_at, adjustment_notes, status",
      )
      .eq("id", negotiationId)
      .single();

    if (negotiationError) {
      throw new Error(negotiationError.message);
    }
    if (negotiation.request_id !== requestId) {
      throw new Error("Negotiation does not belong to this request.");
    }
    if (negotiation.status !== "open") {
      throw new Error("This negotiation round is no longer open.");
    }
    if (negotiation.initiated_by === userId) {
      throw new Error("Only PM-initiated negotiation requests can be accepted here.");
    }
    if (negotiation.quote_id && negotiation.quote_id !== quoteId) {
      throw new Error("Negotiation does not match the current quote.");
    }

    const responseAmount = Number(
      negotiation.expected_amount ?? sourceQuote.total_amount,
    );
    if (!Number.isFinite(responseAmount) || responseAmount < 0) {
      throw new Error("Accepted quote amount is required.");
    }

    const responseDeliveryAt =
      negotiation.expected_delivery_at ?? sourceQuote.estimated_delivery_at ?? null;
    const responseNotes =
      negotiation.adjustment_notes?.trim() ||
      "Requester accepted the PM negotiation proposal.";
    const sourceItem = Array.isArray(sourceQuote.quote_items)
      ? sourceQuote.quote_items[0]
      : null;

    const responseQuote = await createRequesterNegotiationQuote(supabase, {
      amount: responseAmount,
      currency: sourceQuote.currency ?? "USD",
      estimatedDeliveryAt: responseDeliveryAt,
      label: sourceItem?.label ?? "Patent translation service",
      notes: responseNotes,
      requestId,
      source: "requester_accept_pm_negotiation",
    });

    await supabase
      .from("quotes")
      .update({ status: "superseded" })
      .eq("request_id", requestId)
      .eq("status", "accepted")
      .neq("id", responseQuote.id);

    await supabase.from("quotes").update({ status: "superseded" }).eq("id", quoteId);
    await supabase.from("quotes").update({ status: "accepted" }).eq("id", responseQuote.id);

    await supabase.from("quote_negotiation_messages").insert({
      negotiation_id: negotiationId,
      author_id: userId,
      body: responseNotes,
      expected_amount: responseAmount,
      expected_delivery_at: responseDeliveryAt,
      adjustment_notes: responseNotes,
    });
    await supabase
      .from("quote_negotiations")
      .update({
        pm_decision: "reasonable",
        status: "accepted",
        response_quote_id: responseQuote.id,
      })
      .eq("id", negotiationId);
    await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "quoted",
        requester_status: "responding",
        pm_status: "responding",
      })
      .eq("id", requestId);
    await writeRequestEvent(
      supabase,
      requestId,
      userId,
      "quote.negotiation.accepted.requester",
      request.workflow_stage ?? "negotiation",
      "quoted",
      { negotiationId, quoteId: responseQuote.id },
    );

    revalidatePath(`/requester/requests/${requestId}`);
    revalidatePath(`/requester/requests/${requestId}/quote`);
    revalidatePath("/requester");
    revalidatePath("/requester/requests");
    revalidatePath("/pm");
    revalidatePath("/pm/requests");
    revalidatePath(`/pm/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function rejectQuote(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const reason = requiredString(formData.get("reason"), "Reject reason");

    await supabase.from("quotes").update({ status: "rejected" }).eq("id", quoteId);
    await supabase.from("translation_requests").update({
      workflow_stage: "closed",
      requester_status: "rejected",
      pm_status: "rejected",
      closed_at: new Date().toISOString(),
    }).eq("id", requestId);
    await supabase.from("quote_negotiations").insert({
      request_id: requestId,
      quote_id: quoteId,
      initiated_by: userId,
      reject_reason: reason,
      status: "closed",
    });
    await writeRequestEvent(supabase, requestId, userId, "quote.rejected", "quoted", "closed", { reason });

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function negotiateQuote(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const negotiationInput = parseQuoteNegotiationInput(formData);

    await startQuoteNegotiation(
      supabase,
      requestId,
      quoteId,
      userId,
      negotiationInput,
    );

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

function buildRequirementInput(requestId: string, formData: FormData) {
  const dueAt = validateFutureDateString(optionalString(formData.get("dueAt")), "Due date");
  const configSnapshot = {
    customScope: optionalString(formData.get("customScope")),
    deliveryOption: DEFAULT_DELIVERY_OPTION,
    todo: "Quote engine should consume this snapshot.",
  };

  return {
    request_id: requestId,
    source_language: requiredString(formData.get("sourceLanguage"), "Source language"),
    target_language: requiredString(formData.get("targetLanguage"), "Target language"),
    scope_type: requiredString(formData.get("scopeType"), "Translation scope"),
    scope_details: configSnapshot,
    purpose: requiredString(formData.get("purpose"), "Translation purpose"),
    quality_level: requiredString(formData.get("qualityLevel"), "Quality level"),
    delivery_option: DEFAULT_DELIVERY_OPTION,
    due_at: dueAt,
    is_urgent: formData.get("isUrgent") === "on",
    terminology_notes: null,
    config_snapshot: configSnapshot,
  };
}

async function createConfigVersion(
  supabase: SupabaseClient,
  requestId: string,
  requirementId: string,
  snapshot: object,
  userId: string,
) {
  const { data, error } = await supabase.from("request_config_versions").insert({
    request_id: requestId,
    translation_requirement_id: requirementId,
    version_no: await nextVersion(supabase, "request_config_versions", requestId),
    config_snapshot: snapshot,
    created_by: userId,
  }).select("id").single();

  if (error) throw new Error(error.message);
  return data.id;
}

async function selectedRequestFiles(
  supabase: SupabaseClient,
  requestId: string,
): Promise<SelectedRequestFile[]> {
  const { data } = await supabase
    .from("request_files")
    .select("id, file_parse_results(word_count, page_count, claim_count, technical_fields)")
    .eq("request_id", requestId)
    .eq("confirmed_for_translation", true);
  return data ?? [];
}

async function createRequesterNegotiationQuote(
  supabase: SupabaseClient,
  seed: QuoteSeed,
) {
  const { data: files, error: filesError } = await supabase
    .from("request_files")
    .select("id, file_parse_results(word_count, page_count, claim_count, technical_fields)")
    .eq("request_id", seed.requestId)
    .eq("confirmed_for_translation", true);

  if (filesError) {
    throw new Error(filesError.message);
  }

  const wordCount = sumParseMetric(files ?? [], "word_count");
  const versionNo = await nextVersion(supabase, "quotes", seed.requestId);
  const pricingSnapshot = {
    source: seed.source,
    wordCount,
    manualAmount: seed.amount,
  };

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      request_id: seed.requestId,
      version_no: versionNo,
      status: "generated",
      currency: seed.currency,
      total_amount: seed.amount,
      estimated_delivery_at: seed.estimatedDeliveryAt,
      valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
      notes: seed.notes,
      pricing_snapshot: pricingSnapshot,
      breakdown_json: pricingSnapshot,
    })
    .select("id")
    .single();

  if (quoteError) {
    throw new Error(quoteError.message);
  }

  const { error: quoteItemError } = await supabase.from("quote_items").insert({
    quote_id: quote.id,
    label: seed.label,
    amount: seed.amount,
    quantity: wordCount || null,
    unit: wordCount ? "word" : "project",
    description: seed.notes,
  });
  if (quoteItemError) {
    throw new Error(quoteItemError.message);
  }

  const { error: factorError } = await supabase.from("quote_factor_snapshots").insert({
    quote_id: quote.id,
    factors: {
      ...pricingSnapshot,
      amount: seed.amount,
    },
  });
  if (factorError) {
    throw new Error(factorError.message);
  }

  return quote;
}
