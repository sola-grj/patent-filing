import { randomUUID } from "node:crypto";

import type { WizardPayload } from "@/features/requester/wizard-types";
import type { getAuthenticatedUser } from "../server-utils";
import { calculateQuote } from "./helpers";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];

export async function createWizardQuote(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
) {
  const quoteId = randomUUID();
  const wordCount = totalWordCount(payload);
  const totalAmount = calculateQuote(wordCount, payload.config.qualityLevel, payload.config.isUrgent);
  await supabase.from("quotes").insert({
    id: quoteId,
    request_id: requestId,
    version_no: 1,
    status: "generated",
    currency: "USD",
    total_amount: totalAmount,
    estimated_delivery_at: payload.config.dueAt || null,
    valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
    notes: "TODO: replace mock quote with formal pricing engine output.",
    pricing_snapshot: { wordCount, quality: payload.config.qualityLevel },
    breakdown_json: { baseRate: 0.12, urgent: payload.config.isUrgent },
  });
  await supabase.from("quote_items").insert([
    {
      quote_id: quoteId,
      label: "Word count",
      amount: Math.round(wordCount * 0.12),
      quantity: wordCount,
      unit: "word",
    },
    {
      quote_id: quoteId,
      label: "Quality and delivery factors",
      amount: totalAmount - Math.round(wordCount * 0.12),
      unit: "factor",
    },
  ]);
  await supabase.from("quote_factor_snapshots").insert({
    quote_id: quoteId,
    factors: {
      wordCount,
      languagePair: `${payload.config.sourceLanguage}-${payload.config.targetLanguage}`,
      qualityLevel: payload.config.qualityLevel,
      deliveryOption: payload.config.deliveryOption,
      urgent: payload.config.isUrgent,
    },
  });
}

function totalWordCount(payload: WizardPayload) {
  const selectedPatentFiles = payload.selectedPatent?.downloadableFiles.filter((file) =>
    payload.selectedPatentFileIds.includes(file.id),
  ) ?? [];
  if (selectedPatentFiles.length) {
    return selectedPatentFiles.reduce((total, file) => total + file.wordCount, 0);
  }
  return Math.max(payload.uploadedFiles.length, 1) * 12000;
}
