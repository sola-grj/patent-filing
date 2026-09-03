"use server";

import { writeRequestEvent } from "@/features/requester/actions/helpers";
import { optionalString, requiredString, type ActionResult } from "@/lib/validators/requester";

import {
  assertPm,
  createDraft,
  deliverEmail,
  type EmailActionData,
  getEligibleFilingRequest,
  getRequesterProfile,
  getSignatureEmailData,
  revalidateSignaturePaths,
  updateDraft,
} from "./pm-service";
import { removeSignatureFile, uploadSignatureFiles } from "./storage";
import type { FilingSignatureFile, FilingSignatureRequest } from "./types";
import { validateSignatureUploadCountries } from "./country-scope";
import {
  signatureUploadsFromFormData,
  validateSignatureDueDate,
  validateSignatureFiles,
} from "./validation";
import { toPmErrorMessage } from "@/features/pm/server-utils";
import { measureServerOperation, measureStep } from "@/lib/performance/server-timing";

export async function savePmSignatureDraft(
  formData: FormData,
): Promise<ActionResult<{ signatureRequest: FilingSignatureRequest }>> {
  const timings = { auth_ms: 0, db_ms: 0, storage_ms: 0 };
  try {
    return await measureServerOperation("filing_signature.save_draft", async () => {
    const contextStep = await measureStep(() => assertPm());
    timings.auth_ms = contextStep.durationMs;
    const context = contextStep.result;
    const requestId = requiredString(formData.get("requestId"), "Request");
    const pmNote = optionalString(formData.get("pmNote"));
    if ((pmNote?.length ?? 0) > 2000) {
      throw new Error("The requester message must not exceed 2,000 characters.");
    }
    const dueAt = validateSignatureDueDate(optionalString(formData.get("dueAt")));
    const uploads = signatureUploadsFromFormData(formData);
    const files = uploads.map((upload) => upload.file);
    const preflightStep = await measureStep(async () => {
      const [request, activeResult] = await Promise.all([
        getEligibleFilingRequest(context, requestId),
        context.supabase
          .from("filing_signature_requests")
          .select(
            "id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at)",
          )
          .eq("request_id", requestId)
          .in("status", ["draft", "sent"])
          .maybeSingle(),
      ]);
      validateSignatureUploadCountries(uploads, request.countryScope);
      const profile = await getRequesterProfile(context, request.requester_id);
      return { request, profile, activeResult };
    });
    timings.db_ms += preflightStep.durationMs;
    const { request, profile, activeResult } = preflightStep.result;
    const { data: active, error: activeError } = activeResult;
    if (activeError) throw new Error(activeError.message);
    if (active?.status === "sent") {
      throw new Error("Complete or cancel the active signature request before creating another one.");
    }

    const existingFiles = ((active?.filing_signature_files ?? []) as FilingSignatureFile[])
      .filter((file) => file.direction === "pm_to_requester");
    validateSignatureFiles(
      files,
      existingFiles.length,
      existingFiles.reduce((total, file) => total + Number(file.file_size), 0),
    );
    if (!existingFiles.length && !files.length) {
      throw new Error("Upload at least one signature document before saving the draft.");
    }

    const draftStep = await measureStep(() => active
      ? updateDraft(context, active.id, {
          dueAt,
          pmNote,
          recipientEmail: profile?.email ?? null,
          recipientName: profile?.display_name ?? null,
        })
      : createDraft(context, {
          dueAt,
          pmNote,
          recipientEmail: profile?.email ?? null,
          recipientId: request.requester_id,
          recipientName: profile?.display_name ?? null,
          requestId,
        }));
    timings.db_ms += draftStep.durationMs;
    const signatureRequest = draftStep.result;

    const uploadedFiles = files.length
      ? await measureStep(() => uploadSignatureFiles(context.supabase, {
          uploads,
          requestId,
          signatureRequestId: signatureRequest.id,
          direction: "pm_to_requester",
          userId: context.userId,
        }))
      : null;
    if (uploadedFiles) {
      timings.storage_ms = uploadedFiles.durationMs;
    }

    revalidateSignaturePaths(requestId);
    return {
      success: true,
      data: {
        signatureRequest: {
          ...signatureRequest,
          filing_signature_files: [
            ...(active?.filing_signature_files ?? []),
            ...(uploadedFiles?.result ?? []),
          ] as FilingSignatureFile[],
        },
      },
    };
    }, timings);
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function removePmSignatureFile(formData: FormData): Promise<ActionResult> {
  try {
    const context = await assertPm();
    const fileId = requiredString(formData.get("fileId"), "File");
    const { data: file, error: fileError } = await context.supabase
      .from("filing_signature_files")
      .select(
        "id, signature_request_id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at",
      )
      .eq("id", fileId)
      .single();
    if (fileError) throw new Error(fileError.message);

    const { data: signatureRequest, error: requestError } = await context.supabase
      .from("filing_signature_requests")
      .select("id, request_id, status")
      .eq("id", file.signature_request_id)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (file.direction !== "pm_to_requester" || signatureRequest.status !== "draft") {
      throw new Error("Only source files in a draft signature request can be removed.");
    }

    await removeSignatureFile(file as FilingSignatureFile);
    revalidateSignaturePaths(signatureRequest.request_id);
    return { success: true };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function sendPmSignatureRequest(
  formData: FormData,
): Promise<ActionResult<EmailActionData>> {
  const timings = { auth_ms: 0, db_ms: 0, email_ms: 0 };
  try {
    return await measureServerOperation("filing_signature.send", async () => {
    const contextStep = await measureStep(() => assertPm());
    timings.auth_ms = contextStep.durationMs;
    const context = contextStep.result;
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const requestStep = await measureStep(() =>
      getSignatureEmailData(context, signatureRequestId),
    );
    timings.db_ms += requestStep.durationMs;
    const signatureRequest = requestStep.result;
    const pmNote = formData.has("pmNote")
      ? optionalString(formData.get("pmNote"))
      : signatureRequest.pm_note ?? null;
    if ((pmNote?.length ?? 0) > 2000) {
      throw new Error("The requester message must not exceed 2,000 characters.");
    }
    const dueAt = formData.has("dueAt")
      ? validateSignatureDueDate(optionalString(formData.get("dueAt")))
      : signatureRequest.due_at ?? null;
    const profileStep = await measureStep(() =>
      getRequesterProfile(context, signatureRequest.recipient_id),
    );
    timings.db_ms += profileStep.durationMs;
    const profile = profileStep.result;
    if (!profile?.email?.trim()) {
      throw new Error("The requester email address is missing.");
    }

    const recipientStep = await measureStep(async () => await context.supabase
      .from("filing_signature_requests")
      .update({
        recipient_name: profile.display_name ?? null,
        recipient_email: profile.email,
        pm_note: pmNote,
        due_at: dueAt,
      })
      .eq("id", signatureRequestId)
      .eq("status", "draft"));
    timings.db_ms += recipientStep.durationMs;
    const { error: recipientError } = recipientStep.result;
    if (recipientError) throw new Error(recipientError.message);

    const sendStep = await measureStep(async () => await context.supabase.rpc(
      "send_filing_signature_request",
      { target_signature_request_id: signatureRequestId },
    ));
    timings.db_ms += sendStep.durationMs;
    const { error: sendError } = sendStep.result;
    if (sendError) throw new Error(sendError.message);

    const sentRequestStep = await measureStep(() =>
      getSignatureEmailData(context, signatureRequestId),
    );
    timings.db_ms += sentRequestStep.durationMs;
    const emailStep = await measureStep(() =>
      deliverEmail(context, sentRequestStep.result),
    );
    timings.email_ms = emailStep.durationMs;
    const result = emailStep.result;
    const sentRequest = sentRequestStep.result;
    revalidateSignaturePaths(sentRequest.request_id);
    return { success: true, data: result };
    }, timings);
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function retryPmSignatureEmail(
  formData: FormData,
): Promise<ActionResult<EmailActionData>> {
  try {
    const context = await assertPm();
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const signatureRequest = await getSignatureEmailData(context, signatureRequestId);
    if (signatureRequest.status !== "sent") {
      throw new Error("Only a pending signature request can resend its email.");
    }

    const result = await deliverEmail(context, signatureRequest, true);
    revalidateSignaturePaths(signatureRequest.request_id);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}

export async function cancelPmSignatureRequest(formData: FormData): Promise<ActionResult> {
  try {
    const context = await assertPm();
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const { data: signatureRequest, error: requestError } = await context.supabase
      .from("filing_signature_requests")
      .select("id, request_id, status, recipient_id")
      .eq("id", signatureRequestId)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (!(["draft", "sent"] as string[]).includes(signatureRequest.status)) {
      throw new Error("Only a draft or pending signature request can be cancelled.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await context.supabase
      .from("filing_signature_requests")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("id", signatureRequestId);
    if (updateError) throw new Error(updateError.message);

    await context.supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("entity_type", "filing_signature_request")
      .eq("entity_id", signatureRequestId)
      .is("read_at", null);
    await writeRequestEvent(
      context.supabase,
      signatureRequest.request_id,
      context.userId,
      "filing.signature.cancelled.pm",
      null,
      null,
      { signatureRequestId },
    );

    revalidateSignaturePaths(signatureRequest.request_id);
    return { success: true };
  } catch (error) {
    return { success: false, error: toPmErrorMessage(error) };
  }
}
