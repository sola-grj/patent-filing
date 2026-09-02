"use server";

import { toPmErrorMessage } from "@/features/pm/server-utils";
import { writeRequestEvent } from "@/features/requester/actions/helpers";
import { requiredString, type ActionResult } from "@/lib/validators/requester";

import {
  assertPm,
  deliverEmail,
  type EmailActionData,
  getEligibleFilingRequest,
  getSignatureEmailData,
  revalidateSignaturePaths,
} from "./pm-service";
import { cleanupSignatureFiles, uploadSignatureFiles } from "./storage";
import type { FilingSignatureFile } from "./types";
import {
  signatureFilesFromFormData,
  validateSignatureFiles,
} from "./validation";

export async function appendPmSignatureFiles(
  formData: FormData,
): Promise<ActionResult<EmailActionData>> {
  let uploaded: FilingSignatureFile[] = [];
  let appendCommitted = false;

  try {
    const context = await assertPm();
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const files = signatureFilesFromFormData(formData, "files");
    if (!files.length) {
      throw new Error("Choose at least one additional document to upload.");
    }

    const { data: signatureRequest, error: requestError } = await context.supabase
      .from("filing_signature_requests")
      .select(
        "id, request_id, status, filing_signature_files(id, direction, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at)",
      )
      .eq("id", signatureRequestId)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (signatureRequest.status !== "sent") {
      throw new Error("Additional documents can only be added to a pending signature request.");
    }

    await getEligibleFilingRequest(context, signatureRequest.request_id);
    const existingFiles = ((signatureRequest.filing_signature_files ?? []) as FilingSignatureFile[])
      .filter((file) => file.direction === "pm_to_requester");
    validateSignatureFiles(
      files,
      existingFiles.length,
      existingFiles.reduce((total, file) => total + Number(file.file_size), 0),
    );

    uploaded = await uploadSignatureFiles(context.supabase, {
      files,
      requestId: signatureRequest.request_id,
      signatureRequestId,
      direction: "pm_to_requester",
      userId: context.userId,
    });

    const { data: updated, error: updateError } = await context.supabase
      .from("filing_signature_requests")
      .update({
        sent_at: new Date().toISOString(),
        email_status: "pending",
        email_last_error: null,
      })
      .eq("id", signatureRequestId)
      .eq("status", "sent")
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      throw new Error("The requester has already responded to this signature request.");
    }
    appendCommitted = true;

    const updatedRequest = await getSignatureEmailData(context, signatureRequestId);
    const result = await deliverEmail(context, updatedRequest);
    await writeRequestEvent(
      context.supabase,
      signatureRequest.request_id,
      context.userId,
      "filing.signature.files_added.pm",
      null,
      null,
      {
        signatureRequestId,
        addedFileCount: uploaded.length,
        totalFileCount: existingFiles.length + uploaded.length,
        emailSent: result.emailSent,
      },
    );

    revalidateSignaturePaths(signatureRequest.request_id);
    return { success: true, data: result };
  } catch (error) {
    if (uploaded.length && !appendCommitted) {
      await cleanupSignatureFiles(uploaded);
    }
    return { success: false, error: toPmErrorMessage(error) };
  }
}
