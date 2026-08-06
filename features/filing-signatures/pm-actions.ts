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
import type { FilingSignatureFile } from "./types";
import {
  signatureFilesFromFormData,
  validateSignatureDueDate,
  validateSignatureFiles,
} from "./validation";
import { toPmErrorMessage } from "@/features/pm/server-utils";

export async function savePmSignatureDraft(
  formData: FormData,
): Promise<ActionResult<{ signatureRequestId: string }>> {
  try {
    const context = await assertPm();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const pmNote = optionalString(formData.get("pmNote"));
    if ((pmNote?.length ?? 0) > 2000) {
      throw new Error("The requester message must not exceed 2,000 characters.");
    }
    const dueAt = validateSignatureDueDate(optionalString(formData.get("dueAt")));
    const files = signatureFilesFromFormData(formData, "files");
    const request = await getEligibleFilingRequest(context, requestId);
    const profile = await getRequesterProfile(context, request.requester_id);

    const { data: active, error: activeError } = await context.supabase
      .from("filing_signature_requests")
      .select("*, filing_signature_files(*)")
      .eq("request_id", requestId)
      .in("status", ["draft", "sent"])
      .maybeSingle();
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

    const signatureRequest = active
      ? await updateDraft(context, active.id, {
          dueAt,
          pmNote,
          recipientEmail: profile?.email ?? null,
          recipientName: profile?.display_name ?? null,
        })
      : await createDraft(context, {
          dueAt,
          pmNote,
          recipientEmail: profile?.email ?? null,
          recipientId: request.requester_id,
          recipientName: profile?.display_name ?? null,
          requestId,
        });

    if (files.length) {
      await uploadSignatureFiles(context.supabase, {
        files,
        requestId,
        signatureRequestId: signatureRequest.id,
        direction: "pm_to_requester",
        userId: context.userId,
      });
    }

    revalidateSignaturePaths(requestId);
    return { success: true, data: { signatureRequestId: signatureRequest.id } };
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
      .select("*")
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
  try {
    const context = await assertPm();
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const signatureRequest = await getSignatureEmailData(context, signatureRequestId);
    const pmNote = formData.has("pmNote")
      ? optionalString(formData.get("pmNote"))
      : signatureRequest.pm_note ?? null;
    if ((pmNote?.length ?? 0) > 2000) {
      throw new Error("The requester message must not exceed 2,000 characters.");
    }
    const dueAt = formData.has("dueAt")
      ? validateSignatureDueDate(optionalString(formData.get("dueAt")))
      : signatureRequest.due_at ?? null;
    const profile = await getRequesterProfile(context, signatureRequest.recipient_id);
    if (!profile?.email?.trim()) {
      throw new Error("The requester email address is missing.");
    }

    const { error: recipientError } = await context.supabase
      .from("filing_signature_requests")
      .update({
        recipient_name: profile.display_name ?? null,
        recipient_email: profile.email,
        pm_note: pmNote,
        due_at: dueAt,
      })
      .eq("id", signatureRequestId)
      .eq("status", "draft");
    if (recipientError) throw new Error(recipientError.message);

    const { error: sendError } = await context.supabase.rpc(
      "send_filing_signature_request",
      { target_signature_request_id: signatureRequestId },
    );
    if (sendError) throw new Error(sendError.message);

    const sentRequest = await getSignatureEmailData(context, signatureRequestId);
    const result = await deliverEmail(context, sentRequest);
    revalidateSignaturePaths(sentRequest.request_id);
    return { success: true, data: result };
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
