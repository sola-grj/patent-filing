"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser, toErrorMessage } from "@/features/requester/server-utils";
import { createServiceClient } from "@/lib/supabase/server";
import { requiredString, type ActionResult } from "@/lib/validators/requester";

import { cleanupSignatureFiles, uploadSignatureFiles } from "./storage";
import type { FilingSignatureFile } from "./types";
import {
  missingReturnCountryIds,
  requiredReturnCountryIds,
  signatureCountryScope,
  validateSignatureUploadCountries,
} from "./country-scope";
import { signatureUploadsFromFormData, validateSignatureFiles } from "./validation";

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
    const uploads = signatureUploadsFromFormData(formData);
    const files = uploads.map((upload) => upload.file);
    if (!files.length) {
      throw new Error("Choose at least one signed file to upload.");
    }
    validateSignatureFiles(files);

    const { data: signatureRequest, error: requestError } = await supabase
      .from("filing_signature_requests")
      .select(
        "id, request_id, recipient_id, status, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at), translation_requests(translation_requirements(ep_service_type_code, ep_country_ids))",
      )
      .eq("id", signatureRequestId)
      .single();
    if (requestError) throw new Error(requestError.message);
    if (signatureRequest.recipient_id !== userId || signatureRequest.status !== "sent") {
      throw new Error("This signature request is not available for submission.");
    }

    const request = firstRelation(signatureRequest.translation_requests);
    const requirement = firstRelation(request?.translation_requirements);
    const countryScope = signatureCountryScope(requirement);

    const packageFiles = (signatureRequest.filing_signature_files ?? []) as FilingSignatureFile[];
    const sourceFiles = packageFiles.filter((file) => file.direction === "pm_to_requester");
    const legacyOnlyPackage = countryScope.countryScoped
      && sourceFiles.length > 0
      && sourceFiles.every((file) => file.ep_country_id == null);
    validateSignatureUploadCountries(
      uploads,
      legacyOnlyPackage
        ? { countryScoped: false, countryIds: [] }
        : countryScope,
    );
    const existingReturns = packageFiles
      .filter((file) => file.direction === "requester_to_pm");
    if (existingReturns.length) {
      throw new Error("Signed files have already been submitted for this request.");
    }
    const requiredCountries = requiredReturnCountryIds(sourceFiles);
    if (
      requiredCountries.length
      && uploads.some((upload) => !requiredCountries.includes(upload.epCountryId ?? -1))
    ) {
      throw new Error("Signed files may only be returned for countries included in this package.");
    }

    uploaded = await uploadSignatureFiles(supabase, {
      uploads,
      requestId: signatureRequest.request_id,
      signatureRequestId,
      direction: "requester_to_pm",
      userId,
    });

    const missingCountries = missingReturnCountryIds(sourceFiles, uploaded);
    if (missingCountries.length) {
      throw new Error(`Upload at least one signed file for country ${missingCountries.join(", ")}.`);
    }

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

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
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
