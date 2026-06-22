import { optionalNumber, optionalString } from "@/lib/validators/requester";

import { type getAuthenticatedUser } from "../server-utils";
import { writeRequestEvent } from "./helpers";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];

export type QuoteNegotiationInput = {
  adjustmentNotes: string | null;
  expectedAmount: number | null;
  expectedDeliveryAt: string | null;
};

export function parseQuoteNegotiationInput(
  formData: FormData,
): QuoteNegotiationInput {
  const input = {
    expectedAmount: optionalNumber(formData.get("expectedAmount")),
    expectedDeliveryAt: optionalString(formData.get("expectedDeliveryAt")),
    adjustmentNotes: optionalString(formData.get("adjustmentNotes")),
  };

  if (!input.expectedAmount && !input.expectedDeliveryAt && !input.adjustmentNotes) {
    throw new Error("Provide expected price, delivery date, or adjustment notes.");
  }

  return input;
}

export async function startQuoteNegotiation(
  supabase: SupabaseClient,
  requestId: string,
  quoteId: string,
  userId: string,
  input: QuoteNegotiationInput,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabase
    .from("quote_negotiations")
    .insert({
      request_id: requestId,
      quote_id: quoteId,
      initiated_by: userId,
      expected_amount: input.expectedAmount,
      expected_delivery_at: input.expectedDeliveryAt,
      adjustment_notes: input.adjustmentNotes,
      status: "open",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.from("quote_negotiation_messages").insert({
    negotiation_id: data.id,
    author_id: userId,
    body: input.adjustmentNotes ?? "Negotiation request submitted.",
    expected_amount: input.expectedAmount,
    expected_delivery_at: input.expectedDeliveryAt,
    adjustment_notes: input.adjustmentNotes,
  });
  await supabase.from("quotes").update({ status: "negotiating" }).eq("id", quoteId);
  await supabase
    .from("translation_requests")
    .update({
      workflow_stage: "negotiation",
      requester_status: "negotiation",
      pm_status: "negotiation",
    })
    .eq("id", requestId);
  await writeRequestEvent(
    supabase,
    requestId,
    userId,
    "quote.negotiation.started",
    "quoted",
    "negotiation",
    payload,
  );
}
