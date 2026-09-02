"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toErrorMessage } from "@/features/requester/server-utils";
import { createServiceClient } from "@/lib/supabase/server";
import { requiredString, type ActionResult } from "@/lib/validators/requester";

import { cleanupSignatureFiles, uploadSignatureFiles } from "./storage";
import type { FilingSignatureFile } from "./types";
import { signatureFilesFromFormData, validateSignatureFiles } from "./validation";

export async function submitRequesterSignatureFiles(
  formData: FormData,
): Promise<ActionResult> {
  let uploaded: FilingSignatureFile[] = [];

  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const signatureRequestId = requiredString(
      formData.get("signatureRequestId"),
      "Signature request",
    );
    const files = signatureFilesFromFormData(formData, "files");
    if (!files.length) {
      throw new Error("Choose at least one signed file to upload.");
    }
    validateSignatureFiles(files);

    const { data: signatureRequest, error: requestError } = await supabase
      .from("filing_signature_requests")
      .select(
        "id, request_id, recipient_id, status, filing_signature_files(id, direction, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at)",
      )
      .eq("id", signatureRequestId)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (signatureRequest.recipient_id !== userId || signatureRequest.status !== "sent") {
      throw new Error("This signature request is not available for submission.");
    }

    const existingReturns = ((signatureRequest.filing_signature_files ?? []) as FilingSignatureFile[])
      .filter((file) => file.direction === "requester_to_pm");
    if (existingReturns.length) {
      throw new Error("Signed files have already been submitted for this request.");
    }

    uploaded = await uploadSignatureFiles(supabase, {
      files,
      requestId: signatureRequest.request_id,
      signatureRequestId,
      direction: "requester_to_pm",
      userId,
    });

    await completeSignatureRequest({
      signatureRequestId,
      requestId: signatureRequest.request_id,
      userId,
      fileCount: uploaded.length,
    });

    revalidatePath(`/requester/requests/${signatureRequest.request_id}`);
    revalidatePath(`/pm/${signatureRequest.request_id}`);
    revalidatePath("/requester");
    return { success: true };
  } catch (error) {
    if (uploaded.length) {
      await cleanupSignatureFiles(uploaded);
    }
    return { success: false, error: toErrorMessage(error) };
  }
}

async function completeSignatureRequest(input: {
  signatureRequestId: string;
  requestId: string;
  userId: string;
  fileCount: number;
}) {
  const service = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await service
    .from("filing_signature_requests")
    .update({ status: "completed", completed_at: now })
    .eq("id", input.signatureRequestId)
    .eq("recipient_id", input.userId)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The signature request is no longer pending.");

  await service
    .from("notifications")
    .update({ read_at: now })
    .eq("recipient_id", input.userId)
    .eq("entity_type", "filing_signature_request")
    .eq("entity_id", input.signatureRequestId)
    .is("read_at", null);

  await service.from("request_events").insert({
    request_id: input.requestId,
    actor_id: input.userId,
    event_type: "filing.signature.submitted.requester",
    payload: {
      signatureRequestId: input.signatureRequestId,
      fileCount: input.fileCount,
    },
  });
}
