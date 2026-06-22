"use server";

import { revalidatePath } from "next/cache";

import {
  optionalString,
  requiredString,
  type ActionResult,
} from "@/lib/validators/requester";
import { getAuthenticatedUser, toErrorMessage } from "../server-utils";
import { calculateQuote, nextVersion, sumParseMetric, writeRequestEvent } from "./helpers";
import {
  parseQuoteNegotiationInput,
  startQuoteNegotiation,
} from "./quote-negotiation";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];
type SelectedRequestFile = { id: string; file_parse_results?: unknown };
type RequirementInput = ReturnType<typeof buildRequirementInput>;

export async function saveTranslationConfigAndGenerateQuote(formData: FormData): Promise<ActionResult> {
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

    const wordCount = sumParseMetric(files, "word_count") || 12000;
    await createMockQuote(supabase, requestId, requirementInput, wordCount);
    await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "quoted",
        requester_status: "responding",
        pm_status: "responding",
      })
      .eq("id", requestId);
    await writeRequestEvent(supabase, requestId, userId, "quote.generated.mock", "configured", "quoted");

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function acceptQuote(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const quoteId = requiredString(formData.get("quoteId"), "Quote");
    const { data: request, error } = await supabase
      .from("translation_requests")
      .select("id, organization_id, requester_id")
      .eq("id", requestId)
      .single();

    if (error) throw new Error(error.message);

    await supabase.from("quotes").update({ status: "accepted" }).eq("id", quoteId);
    await supabase
      .from("translation_requests")
      .update({
        workflow_stage: "order_pending",
        requester_status: "completed",
        pm_status: "completed",
      })
      .eq("id", requestId);
    await createOrderIfMissing(supabase, requestId, quoteId, request.organization_id, request.requester_id);
    await writeRequestEvent(supabase, requestId, userId, "quote.accepted", "quoted", "order_pending");

    revalidatePath(`/requester/requests/${requestId}`);
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
  const configSnapshot = {
    customScope: optionalString(formData.get("customScope")),
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
    delivery_option: requiredString(formData.get("deliveryOption"), "Delivery option"),
    due_at: optionalString(formData.get("dueAt")),
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

async function createMockQuote(
  supabase: SupabaseClient,
  requestId: string,
  requirement: RequirementInput,
  wordCount: number,
) {
  const totalAmount = calculateQuote(wordCount, requirement.quality_level, requirement.is_urgent);
  const { data: quote, error } = await supabase.from("quotes").insert({
    request_id: requestId,
    version_no: await nextVersion(supabase, "quotes", requestId),
    status: "generated",
    currency: "USD",
    total_amount: totalAmount,
    estimated_delivery_at: requirement.due_at,
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: "TODO: replace mock quote with formal pricing engine output.",
    pricing_snapshot: { wordCount, quality: requirement.quality_level },
    breakdown_json: { baseRate: 0.12, urgent: requirement.is_urgent },
  }).select("id").single();

  if (error) throw new Error(error.message);

  await supabase.from("quote_items").insert([
    { quote_id: quote.id, label: "Word count", amount: Math.round(wordCount * 0.12), quantity: wordCount, unit: "word" },
    { quote_id: quote.id, label: "Quality and delivery factors", amount: totalAmount - Math.round(wordCount * 0.12), unit: "factor" },
  ]);
  await supabase.from("quote_factor_snapshots").insert({
    quote_id: quote.id,
    factors: {
      wordCount,
      languagePair: `${requirement.source_language}-${requirement.target_language}`,
      qualityLevel: requirement.quality_level,
      deliveryOption: requirement.delivery_option,
      urgent: requirement.is_urgent,
    },
  });
  return quote;
}

async function createOrderIfMissing(
  supabase: SupabaseClient,
  requestId: string,
  quoteId: string,
  organizationId: string,
  requesterId: string,
) {
  const { data: existingOrder } = await supabase.from("orders").select("id").eq("request_id", requestId).maybeSingle();
  if (existingOrder) return;

  const { error } = await supabase.from("orders").insert({
    request_id: requestId,
    accepted_quote_id: quoteId,
    organization_id: organizationId,
    requester_id: requesterId,
    status: "pending_confirmation",
  });

  if (error) throw new Error(error.message);
}
