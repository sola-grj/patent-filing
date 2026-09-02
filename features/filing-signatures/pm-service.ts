import "server-only";

import { revalidatePath } from "next/cache";

import { requirePmContext, toPmErrorMessage } from "@/features/pm/server-utils";
import { writeRequestEvent } from "@/features/requester/actions/helpers";

import { sendFilingSignatureEmail } from "./email";
import { signatureCountryScope } from "./country-scope";
import type { FilingSignatureRequest } from "./types";

export type EmailActionData = {
  emailSent: boolean;
  warning?: string;
};

export async function assertPm() {
  const context = await requirePmContext();
  if (context.denied) {
    throw new Error("PM access is required.");
  }
  return context;
}

export async function getEligibleFilingRequest(
  context: Awaited<ReturnType<typeof assertPm>>,
  requestId: string,
) {
  const { data, error } = await context.supabase
    .from("translation_requests")
    .select(
      "id, requester_id, pm_status, translation_requirements(ep_service_type_code, ep_country_ids)",
    )
    .eq("id", requestId)
    .eq("supplier_organization_id", context.organization!.id)
    .single();
  if (error) throw new Error(error.message);
  if (data.pm_status !== "in_progress") {
    throw new Error("Signature documents are only available while the request is In progress.");
  }
  return {
    ...data,
    countryScope: signatureCountryScope(firstRelation(data.translation_requirements)),
  };
}

export async function getRequesterProfile(
  context: Awaited<ReturnType<typeof assertPm>>,
  requesterId: string,
) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("display_name, email")
    .eq("user_id", requesterId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function createDraft(
  context: Awaited<ReturnType<typeof assertPm>>,
  input: {
    requestId: string;
    recipientId: string;
    recipientName: string | null;
    recipientEmail: string | null;
    pmNote: string | null;
    dueAt: string | null;
  },
) {
  const { data, error } = await context.supabase
    .from("filing_signature_requests")
    .insert({
      request_id: input.requestId,
      created_by: context.userId,
      recipient_id: input.recipientId,
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      pm_note: input.pmNote,
      due_at: input.dueAt,
    })
    .select(
      "id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as FilingSignatureRequest;
}

export async function updateDraft(
  context: Awaited<ReturnType<typeof assertPm>>,
  signatureRequestId: string,
  input: {
    recipientName: string | null;
    recipientEmail: string | null;
    pmNote: string | null;
    dueAt: string | null;
  },
) {
  const { data, error } = await context.supabase
    .from("filing_signature_requests")
    .update({
      recipient_name: input.recipientName,
      recipient_email: input.recipientEmail,
      pm_note: input.pmNote,
      due_at: input.dueAt,
    })
    .eq("id", signatureRequestId)
    .eq("status", "draft")
    .select(
      "id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at",
    )
    .single();
  if (error) throw new Error(error.message);
  return data as FilingSignatureRequest;
}

export async function getSignatureEmailData(
  context: Awaited<ReturnType<typeof assertPm>>,
  signatureRequestId: string,
) {
  const { data, error } = await context.supabase
    .from("filing_signature_requests")
    .select(
      "id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at), translation_requests(request_no, title, request_patents(patent_number))",
    )
    .eq("id", signatureRequestId)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as FilingSignatureRequest & {
    translation_requests?: {
      request_no: string;
      title?: string | null;
      request_patents?: { patent_number?: string | null }[] | null;
    } | null;
  };
}

export async function deliverEmail(
  context: Awaited<ReturnType<typeof assertPm>>,
  signatureRequest: Awaited<ReturnType<typeof getSignatureEmailData>>,
  isRetry = false,
): Promise<EmailActionData> {
  const request = signatureRequest.translation_requests;
  if (!request) throw new Error("The parent request could not be loaded.");
  const files = (signatureRequest.filing_signature_files ?? [])
    .filter((file) => file.direction === "pm_to_requester");
  const patent = firstRelation(request.request_patents);
  const matterName = patent?.patent_number || request.title?.trim() || request.request_no;
  const attemptNumber = Number(signatureRequest.email_attempt_count ?? 0) + 1;

  try {
    const providerId = await sendFilingSignatureEmail({
      signatureRequest,
      requestNo: request.request_no,
      matterName,
      files,
      attemptNumber,
    });
    await markEmail(context, signatureRequest, {
      status: "sent",
      providerId,
      error: null,
      isRetry,
      attemptNumber,
    });
    return { emailSent: true };
  } catch (error) {
    const message = toPmErrorMessage(error);
    await markEmail(context, signatureRequest, {
      status: "failed",
      providerId: null,
      error: message,
      isRetry,
      attemptNumber,
    });
    return {
      emailSent: false,
      warning: `Files were sent in Pat, but the email failed: ${message}`,
    };
  }
}

export function revalidateSignaturePaths(requestId: string) {
  revalidatePath(`/pm/${requestId}`);
  revalidatePath(`/requester/requests/${requestId}`);
  revalidatePath("/requester");
}

async function markEmail(
  context: Awaited<ReturnType<typeof assertPm>>,
  signatureRequest: FilingSignatureRequest,
  input: {
    status: "sent" | "failed";
    providerId: string | null;
    error: string | null;
    isRetry: boolean;
    attemptNumber: number;
  },
) {
  const now = new Date().toISOString();
  const { error } = await context.supabase
    .from("filing_signature_requests")
    .update({
      email_status: input.status,
      email_provider_id: input.providerId,
      email_last_error: input.error,
      email_sent_at: input.status === "sent" ? now : null,
      email_attempt_count: input.attemptNumber,
    })
    .eq("id", signatureRequest.id);
  if (error) throw new Error(error.message);

  if (input.isRetry) {
    await writeRequestEvent(
      context.supabase,
      signatureRequest.request_id,
      context.userId,
      "filing.signature.email_retried.pm",
      null,
      null,
      { signatureRequestId: signatureRequest.id, emailStatus: input.status },
    );
  }
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
