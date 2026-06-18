"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  requiredString,
  validateUploadFile,
  type ActionResult,
} from "@/lib/validators/requester";
import {
  getAuthenticatedUser,
  getRequesterOrganization,
  safeFileName,
  toErrorMessage,
} from "../server-utils";
import { inferFileRole, inferLanguage, writeRequestEvent } from "./helpers";

export async function createDraftRequest(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId, organization } = await getRequesterOrganization();
    if (!organization) throw new Error("Create an organization before creating requests.");

    const requestId = randomUUID();
    const { error } = await supabase
      .from("translation_requests")
      .insert({
        id: requestId,
        organization_id: organization.id,
        requester_id: userId,
        source_mode: requiredString(formData.get("sourceMode"), "File source"),
        title: requiredString(formData.get("title"), "Request title"),
        workflow_stage: "draft",
      });

    if (error) throw new Error(error.message);

    await writeRequestEvent(supabase, requestId, userId, "request.created", null, "draft");
    revalidatePath("/requester/requests");
    return { success: true, data: { id: requestId } };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createPatentSearch(
  formData: FormData,
): Promise<ActionResult<{ versions: Array<{ id: string; label: string }> }>> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const patentNumber = requiredString(formData.get("patentNumber"), "Patent number");
    const patentType = patentNumber.toUpperCase().startsWith("PCT") ? "PCT" : "Publication";

    const { data: search, error: searchError } = await supabase
      .from("patent_searches")
      .insert({
        request_id: requestId,
        query: patentNumber,
        detected_patent_type: patentType,
        status: "mocked",
        raw_response: { todo: "Replace with real patent search API.", patentNumber },
      })
      .select("id")
      .single();

    if (searchError) throw new Error(searchError.message);

    const { data: candidate, error: candidateError } = await supabase
      .from("patent_candidates")
      .insert({
        search_id: search.id,
        patent_number: patentNumber,
        title: `Candidate patent ${patentNumber}`,
        jurisdiction: "WO",
        applicants: ["Demo applicant"],
        metadata: { todo: "Mock candidate until patent API is connected." },
      })
      .select("id")
      .single();

    if (candidateError) throw new Error(candidateError.message);

    const { data: versions, error: versionError } = await supabase
      .from("patent_file_versions")
      .insert([
        mockPatentVersion(candidate.id, patentNumber, "Published specification", "pdf"),
        mockPatentVersion(candidate.id, patentNumber, "Claims", "txt"),
      ])
      .select("id, version_label");

    if (versionError) throw new Error(versionError.message);

    await supabase.from("translation_requests").update({ workflow_stage: "file_selection" }).eq("id", requestId);
    await writeRequestEvent(supabase, requestId, userId, "patent.search.mocked", "draft", "file_selection");

    revalidatePath(`/requester/requests/${requestId}`);
    return {
      success: true,
      data: { versions: (versions ?? []).map((version) => ({ id: version.id, label: version.version_label })) },
    };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function createFilesFromPatentVersions(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const versionIds = formData.getAll("versionId").map(String);
    if (!versionIds.length) throw new Error("Select at least one patent file version.");

    const { data: versions, error } = await supabase.from("patent_file_versions").select("*").in("id", versionIds);
    if (error) throw new Error(error.message);

    const { error: insertError } = await supabase.from("request_files").insert(
      (versions ?? []).map((version) => ({
        request_id: requestId,
        source: "patent_search",
        storage_bucket: "request-files",
        storage_path: `external/${requestId}/${version.id}`,
        original_filename: `${version.version_label}.${version.file_type ?? "pdf"}`,
        mime_type: version.file_type === "txt" ? "text/plain" : "application/pdf",
        file_role: version.version_label,
        language: version.language,
        version_label: version.version_label,
        status: "validated",
        metadata: { source_url: version.source_url },
      })),
    );

    if (insertError) throw new Error(insertError.message);

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function uploadRequestFiles(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const files = formData.getAll("files").filter((file): file is File => file instanceof File);
    if (!files.length) throw new Error("Choose at least one file.");

    for (const file of files) {
      validateUploadFile(file);
      const path = `${userId}/${requestId}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: uploadError } = await supabase.storage.from("request-files").upload(
        path,
        new Uint8Array(await file.arrayBuffer()),
        { contentType: file.type, upsert: false },
      );
      if (uploadError) throw new Error(uploadError.message);

      const { error: fileError } = await supabase.from("request_files").insert({
        request_id: requestId,
        source: "upload",
        storage_bucket: "request-files",
        storage_path: path,
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_role: inferFileRole(file.name),
        language: inferLanguage(file.name),
        status: "validated",
        metadata: { size: file.size },
      });
      if (fileError) throw new Error(fileError.message);
    }

    await supabase.from("translation_requests").update({ workflow_stage: "file_selection" }).eq("id", requestId);
    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

export async function confirmFilesAndStartParsing(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, userId } = await getAuthenticatedUser();
    const requestId = requiredString(formData.get("requestId"), "Request");
    const fileIds = await selectedOrAllFileIds(supabase, requestId, formData);
    if (!fileIds.length) throw new Error("Add at least one file before parsing.");

    await supabase.from("request_files").update({ confirmed_for_translation: true, status: "parsed" }).in("id", fileIds);

    for (const fileId of fileIds) {
      await createMockParseResult(supabase, fileId);
    }

    await supabase.from("translation_requests").update({ workflow_stage: "parsing" }).eq("id", requestId);
    await writeRequestEvent(supabase, requestId, userId, "files.parse.mocked", "file_selection", "parsing");

    revalidatePath(`/requester/requests/${requestId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toErrorMessage(error) };
  }
}

function mockPatentVersion(candidateId: string, patentNumber: string, label: string, fileType: string) {
  return {
    candidate_id: candidateId,
    version_label: label,
    file_type: fileType,
    language: "en",
    source_url: `mock://${patentNumber}/${label.toLowerCase().replaceAll(" ", "-")}.${fileType}`,
    is_selected: label === "Published specification",
  };
}

async function selectedOrAllFileIds(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  requestId: string,
  formData: FormData,
) {
  const selected = formData.getAll("fileId").map(String);
  if (selected.length) return selected;

  const { data, error } = await supabase.from("request_files").select("id").eq("request_id", requestId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((file) => file.id);
}

async function createMockParseResult(
  supabase: Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"],
  fileId: string,
) {
  await supabase.from("file_parse_jobs").insert({
    file_id: fileId,
    status: "success",
    attempt_count: 1,
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    payload: { todo: "Replace mock parse job with async parser worker." },
  });
  await supabase.from("file_parse_results").upsert({
    file_id: fileId,
    parse_status: "completed",
    word_count: 12000,
    page_count: 32,
    claim_count: 18,
    technical_fields: ["mechanical", "communications"],
    structure_json: { sections: ["abstract", "description", "claims"] },
    ocr_required: false,
    manual_review_required: false,
  });
}
