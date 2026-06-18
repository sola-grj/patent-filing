import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { type ActionResult, validateUploadFile } from "@/lib/validators/requester";
import type { WizardPayload, WizardPersistResult } from "@/features/requester/wizard-types";
import {
  getAuthenticatedUser,
  getRequesterOrganization,
  safeFileName,
  toErrorMessage,
} from "../server-utils";
import { inferFileRole, inferLanguage, writeRequestEvent } from "./helpers";
import { createWizardQuote } from "./wizard-quote-persistence";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];

export async function persistWizardRequest(
  formData: FormData,
  mode: "draft" | "submit",
): Promise<ActionResult<WizardPersistResult>> {
  try {
    const payload = parseWizardPayload(formData);
    const { supabase, userId, organization } = await getRequesterOrganization();
    if (!organization) throw new Error("Create an organization before creating requests.");

    const requestId = randomUUID();
    await createRequest(supabase, requestId, organization.id, userId, payload, mode);
    const requestFileIds = await persistSourceFiles(supabase, requestId, userId, payload, formData);

    if (mode === "submit") {
      await persistSubmissionArtifacts(supabase, requestId, userId, payload, requestFileIds);
    }

    await writeRequestEvent(
      supabase,
      requestId,
      userId,
      mode === "submit" ? "request.submitted.from_wizard" : "request.draft.saved",
      null,
      mode === "submit" ? "quoted" : "draft",
      { sourceMode: payload.sourceMode, lastStep: payload.lastStep },
    );
    revalidatePath("/requester");
    revalidatePath("/requester/requests");
    return { success: true, data: { requestId } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

function parseWizardPayload(formData: FormData): WizardPayload {
  const payload = JSON.parse(String(formData.get("payload") ?? "")) as WizardPayload;
  if (!payload.title?.trim()) throw new Error("Request title is required.");
  if (!["patent_search", "upload"].includes(payload.sourceMode)) {
    throw new Error("Choose a valid file source.");
  }
  return payload;
}

async function createRequest(
  supabase: SupabaseClient,
  requestId: string,
  organizationId: string,
  userId: string,
  payload: WizardPayload,
  mode: "draft" | "submit",
) {
  const { error } = await supabase.from("translation_requests").insert({
    id: requestId,
    organization_id: organizationId,
    requester_id: userId,
    source_mode: payload.sourceMode,
    title: payload.title.trim(),
    workflow_stage: mode === "submit" ? "quoted" : "draft",
    requester_status: "responding",
    pm_status: "responding",
    draft_payload: payload,
    last_draft_step: payload.lastStep,
    submitted_at: mode === "submit" ? new Date().toISOString() : null,
  });
  if (error) throw new Error(error.message);
}

async function persistSourceFiles(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  formData: FormData,
) {
  if (payload.sourceMode === "upload") {
    return persistUploadedFiles(supabase, requestId, userId, formData);
  }
  return persistPatentSelection(supabase, requestId, payload);
}

async function persistUploadedFiles(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  formData: FormData,
) {
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);
  const fileIds: string[] = [];

  for (const file of files) {
    validateUploadFile(file);
    const fileId = randomUUID();
    const path = `${userId}/${requestId}/${Date.now()}-${safeFileName(file.name)}`;
    const { error: uploadError } = await supabase.storage.from("request-files").upload(
      path,
      new Uint8Array(await file.arrayBuffer()),
      { contentType: file.type, upsert: false },
    );
    if (uploadError) throw new Error(uploadError.message);

    const { error } = await supabase.from("request_files").insert({
      id: fileId,
      request_id: requestId,
      source: "upload",
      storage_bucket: "request-files",
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type || "application/octet-stream",
      file_role: inferFileRole(file.name),
      language: inferLanguage(file.name),
      status: "validated",
      confirmed_for_translation: true,
      metadata: { size: file.size },
    });
    if (error) throw new Error(error.message);
    fileIds.push(fileId);
  }

  return fileIds;
}

async function persistPatentSelection(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
) {
  const patent = payload.selectedPatent;
  if (!patent) return [];

  const searchId = randomUUID();
  const candidateId = randomUUID();
  const selectedFiles = patent.downloadableFiles.filter((file) =>
    payload.selectedPatentFileIds.includes(file.id),
  );

  await supabase.from("patent_searches").insert({
    id: searchId,
    request_id: requestId,
    query: payload.patentQuery ?? patent.patentNumber,
    detected_patent_type: "Publication",
    status: "mocked",
    raw_response: { todo: "Replace with real patent search API.", patent },
  });
  await supabase.from("patent_candidates").insert({
    id: candidateId,
    search_id: searchId,
    patent_number: patent.patentNumber,
    title: patent.title,
    jurisdiction: patent.jurisdiction,
    application_no: patent.applicationNo,
    publication_no: patent.publicationNo,
    applicants: patent.applicants,
    metadata: patent,
  });

  const requestFileIds: string[] = [];
  for (const file of selectedFiles) {
    const versionId = randomUUID();
    const requestFileId = randomUUID();
    await supabase.from("patent_file_versions").insert({
      id: versionId,
      candidate_id: candidateId,
      version_label: file.label,
      file_type: file.fileType,
      language: file.language,
      source_url: file.sourceUrl,
      is_selected: true,
      metadata: file,
    });
    await supabase.from("request_files").insert({
      id: requestFileId,
      request_id: requestId,
      source: "patent_search",
      storage_bucket: "request-files",
      storage_path: `external/${requestId}/${versionId}`,
      original_filename: `${file.label}.${file.fileType}`,
      mime_type: file.fileType === "txt" ? "text/plain" : "application/pdf",
      file_role: file.label,
      language: file.language,
      version_label: file.label,
      confirmed_for_translation: true,
      status: "validated",
      metadata: { source_url: file.sourceUrl, patent_file: file },
    });
    requestFileIds.push(requestFileId);
  }

  return requestFileIds;
}

async function persistSubmissionArtifacts(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  requestFileIds: string[],
) {
  await createParseResults(supabase, requestFileIds, payload);
  const requirementId = randomUUID();
  await createRequirement(supabase, requestId, requirementId, payload);
  const configId = randomUUID();
  await createConfigVersion(supabase, requestId, requirementId, configId, userId, payload);
  await supabase.from("request_config_files").insert(
    requestFileIds.map((fileId) => ({ config_version_id: configId, request_file_id: fileId })),
  );
  await createWizardQuote(supabase, requestId, payload);
}

async function createParseResults(
  supabase: SupabaseClient,
  requestFileIds: string[],
  payload: WizardPayload,
) {
  const selectedPatentFiles = payload.selectedPatent?.downloadableFiles.filter((file) =>
    payload.selectedPatentFileIds.includes(file.id),
  ) ?? [];

  for (const [index, fileId] of requestFileIds.entries()) {
    const patentFile = selectedPatentFiles[index];
    await supabase.from("file_parse_jobs").insert({
      file_id: fileId,
      status: "success",
      attempt_count: 1,
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      payload: { todo: "Replace mock parse job with async parser worker." },
    });
    await supabase.from("file_parse_results").insert({
      file_id: fileId,
      parse_status: "completed",
      word_count: patentFile?.wordCount ?? 12000,
      page_count: patentFile?.pageCount ?? 32,
      claim_count: patentFile?.claimCount ?? 18,
      technical_fields: [payload.selectedPatent?.technicalField ?? "patent"],
      structure_json: { sections: ["abstract", "description", "claims"] },
      ocr_required: false,
      manual_review_required: false,
    });
  }
}

async function createRequirement(
  supabase: SupabaseClient,
  requestId: string,
  requirementId: string,
  payload: WizardPayload,
) {
  const config = payload.config;
  await supabase.from("translation_requirements").insert({
    id: requirementId,
    request_id: requestId,
    source_language: config.sourceLanguage,
    target_language: config.targetLanguage,
    scope_type: config.scopeType,
    scope_details: { customScope: config.customScope },
    purpose: config.purpose,
    quality_level: config.qualityLevel,
    delivery_option: config.deliveryOption,
    due_at: config.dueAt || null,
    is_urgent: config.isUrgent,
    terminology_notes: null,
    config_snapshot: config,
  });
}

async function createConfigVersion(
  supabase: SupabaseClient,
  requestId: string,
  requirementId: string,
  configId: string,
  userId: string,
  payload: WizardPayload,
) {
  await supabase.from("request_config_versions").insert({
    id: configId,
    request_id: requestId,
    translation_requirement_id: requirementId,
    version_no: 1,
    config_snapshot: payload.config,
    created_by: userId,
  });
}
