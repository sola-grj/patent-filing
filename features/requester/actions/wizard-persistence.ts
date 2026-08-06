import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  type ActionResult,
  validateFutureDateString,
  validateUploadFiles,
} from "@/lib/validators/requester";
import type { WizardPayload, WizardPersistResult } from "@/features/requester/wizard-types";
import { jurisdictionOptions } from "@/features/requester/options";
import {
  getAuthenticatedUser,
  getRequesterOrganization,
  safeFileName,
  toErrorMessage,
} from "../server-utils";
import {
  calculateQuote,
  inferFileRole,
  inferLanguage,
  nextVersion,
  sumParseMetric,
  writeRequestEvent,
} from "./helpers";
import {
  verifyPatentReceipts,
} from "./patent-service";
import { enqueueSubmittedPatentFilePreparation } from "./patent-file-readiness";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];
const DEFAULT_DELIVERY_OPTION = "standard";

export async function persistWizardRequest(
  formData: FormData,
  mode: "draft" | "submit",
  options?: {
    deferPatentCache?: boolean;
    deferFormalSubmission?: boolean;
  },
): Promise<ActionResult<WizardPersistResult>> {
  let persistedResult: WizardPersistResult | undefined;
  try {
    let payload = parseWizardPayload(formData);
    const { supabase, userId, organization } = await getRequesterOrganization();
    if (!organization) throw new Error("Create an organization before creating requests.");
    const dictionaryValidation = validateDictionaryValues(supabase, payload);
    if (mode !== "draft") {
      validateCommercialFields(payload);
      validateFutureDateString(payload.config.dueAt, "Due date");
      const [, verifiedPayload] = await Promise.all([
        dictionaryValidation,
        verifySubmittedPatentPayload(payload),
      ]);
      payload = verifiedPayload;
    } else {
      await dictionaryValidation;
    }

    const requestId = payload.requestId ?? randomUUID();
    const uploadedFormFiles = formData.getAll("files").filter((file): file is File => file instanceof File);
    validateUploadFiles(uploadedFormFiles);
    const submittedRequestNo = mode === "submit"
      && payload.requestId
      && payload.sourceMode === "patent_search"
      && !options?.deferFormalSubmission
      && !options?.deferPatentCache
      ? await findSubmittedPatentRequest(
          supabase,
          requestId,
          userId,
        )
      : null;
    if (submittedRequestNo) {
      persistedResult = { requestId, requestNo: submittedRequestNo };
      scheduleSubmittedPatentFile({
        supabase,
        requestId,
        userId,
        lookupReceipt: payload.selectedPatent!.lookupReceipt!,
        analysisReceipt: payload.analysis!.analysis_receipt!,
      });
      revalidateRequestPaths(requestId);
      return { success: true, data: persistedResult };
    }
    const reuseExistingUploadFiles = Boolean(payload.requestId)
      && payload.sourceMode === "upload"
      && uploadedFormFiles.length === 0
      && payload.uploadedFiles.some((file) => Boolean(file.requestFileId));

    if (payload.requestId) {
      await assertEditableDraft(supabase, requestId, userId);
      if (reuseExistingUploadFiles) {
        await reconcileDraftUploadFiles(
          supabase,
          requestId,
          payload.uploadedFiles,
        );
      } else {
        await clearDraftSourceArtifacts(supabase, requestId);
      }
      if (mode === "submit") {
        await clearIncompleteSubmissionArtifacts(supabase, requestId);
      }
    }

    const requestNo = await upsertRequest(
      supabase,
      requestId,
      organization.id,
      userId,
      payload,
      mode,
    );
    const requestFileIds = await persistSourceFiles(
      supabase,
      requestId,
      userId,
      payload,
      formData,
      reuseExistingUploadFiles,
      mode,
    );
    if (mode === "draft" && payload.sourceMode === "upload") {
      payload = await refreshDraftUploadPayload(supabase, requestId, payload);
    }
    persistedResult = { requestId, requestNo };

    if (mode === "draft") {
      await writeRequestEvent(
        supabase,
        requestId,
        userId,
        "request.draft.saved",
        null,
        "draft",
        { sourceMode: payload.sourceMode, lastStep: payload.lastStep },
      );
    } else {
      await persistSubmissionArtifacts(
        supabase,
        requestId,
        userId,
        payload,
        requestFileIds,
        !options?.deferFormalSubmission,
      );
      if (!options?.deferFormalSubmission) {
        await writeRequestEvent(
          supabase,
          requestId,
          userId,
          "request.submitted.from_wizard",
          "draft",
          "quoted",
          { sourceMode: payload.sourceMode, lastStep: payload.lastStep },
        );
      }
      if (
        payload.sourceMode === "patent_search"
        && !options?.deferPatentCache
      ) {
        scheduleSubmittedPatentFile({
          supabase,
          requestId,
          userId,
          lookupReceipt: payload.selectedPatent!.lookupReceipt!,
          analysisReceipt: payload.analysis!.analysis_receipt!,
        });
      }
    }

    revalidateRequestPaths(requestId);
    return { success: true, data: persistedResult };
  } catch (error) {
    return {
      success: false,
      data: persistedResult,
      error: toErrorMessage(error),
    };
  }
}

async function findSubmittedPatentRequest(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("translation_requests")
    .select("request_no, requester_id, source_mode, submitted_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data?.submitted_at) {
    return null;
  }
  if (data.requester_id !== userId || data.source_mode !== "patent_search") {
    throw new Error("This submitted patent Request is not available.");
  }
  return data.request_no as string;
}

async function prepareSubmittedPatentFile(input: {
  supabase: SupabaseClient;
  requestId: string;
  userId: string;
  lookupReceipt: string;
  analysisReceipt: string;
}) {
  try {
    await enqueueSubmittedPatentFilePreparation(input);
  } catch (cacheError) {
    await writeRequestEvent(
      input.supabase,
      input.requestId,
      input.userId,
      "patent.cache.prepare_failed",
      "quoted",
      "quoted",
      {
        message: cacheError instanceof Error
          ? cacheError.message
          : "Patent cache preparation failed.",
        retryable: true,
      },
    ).catch(() => undefined);
  }
}

function scheduleSubmittedPatentFile(input: Parameters<
  typeof prepareSubmittedPatentFile
>[0]) {
  after(() => prepareSubmittedPatentFile(input));
}

function revalidateRequestPaths(requestId: string) {
  revalidatePath("/requester");
  revalidatePath("/requester/drafts");
  revalidatePath(`/requester/drafts/${requestId}`);
  revalidatePath("/requester/requests");
  revalidatePath(`/requester/requests/${requestId}`);
  revalidatePath(`/requester/requests/${requestId}/quote`);
  revalidatePath("/pm");
  revalidatePath(`/pm/${requestId}`);
}

async function verifySubmittedPatentPayload(
  payload: WizardPayload,
): Promise<WizardPayload> {
  if (payload.sourceMode !== "patent_search") return payload;
  const lookupReceipt = payload.selectedPatent?.lookupReceipt;
  const analysisReceipt = payload.analysis?.analysis_receipt;
  if (!payload.selectedPatent || !lookupReceipt || !analysisReceipt) {
    throw new Error(
      "Patent lookup or analysis verification is missing. Search the patent again before submitting.",
    );
  }
  const verified = await verifyPatentReceipts({
    lookupReceipt,
    analysisReceipt,
    fallbackPatentNumber: payload.selectedPatent.patentNumber,
  });
  if (
    !["success", "partial"].includes(verified.analysis.status)
    || verified.analysis.aggregate.total_words <= 0
  ) {
    throw new Error(
      "Patent data processing has not produced usable word counts. Retry before submitting.",
    );
  }
  return {
    ...payload,
    selectedPatent: verified.patent,
    analysis: verified.analysis,
  };
}

function validateCommercialFields(payload: WizardPayload) {
  const config = payload.config;
  const usesTranslationQuality = config.serviceTypes.includes("translation")
    || config.serviceTypes.includes("epv");
  if (
    usesTranslationQuality
    && !["machine_pretranslation", "patent_translator"].includes(config.qualityLevel)
  ) {
    throw new Error("Select machine translation or human translation.");
  }
  if (!config.jurisdictionCodes.length) {
    throw new Error("Select at least one jurisdiction.");
  }
  const hasGrantService = config.serviceTypes.includes(
    "european_patent_grant_registration",
  );
  if (
    config.channelCode !== "ep"
    && (config.serviceTypes.includes("epv") || hasGrantService)
  ) {
    throw new Error("Grant and EPV are only available for EPO.");
  }
  if (config.serviceTypes.includes("filing")) {
    if (!config.filingType || !config.filingApplicationType || !config.entityType) {
      throw new Error("Filing type, application type, and entity type are required for filing.");
    }
  }
  if (config.serviceTypes.includes("epv") && !config.epvType) {
    throw new Error("EPV type is required for EPV.");
  }
}

function parseWizardPayload(formData: FormData): WizardPayload {
  const payload = JSON.parse(String(formData.get("payload") ?? "")) as WizardPayload;
  if (!["patent_search", "upload"].includes(payload.sourceMode)) {
    throw new Error("Choose a valid file source.");
  }
  payload.config.channelCode = payload.config.channelCode
    || channelFromLegacyPurpose(payload.config.purpose);
  payload.config.serviceTypes = Array.isArray(payload.config.serviceTypes)
    ? payload.config.serviceTypes
    : [];
  const isTranslationOnlyService = payload.config.serviceTypes.length === 1
    && payload.config.serviceTypes[0] === "translation";
  payload.config.dueAt = isTranslationOnlyService
    ? payload.config.dueAt?.trim() ?? ""
    : "";
  payload.config.jurisdictionCodes = Array.isArray(payload.config.jurisdictionCodes)
    ? payload.config.jurisdictionCodes
    : [];
  payload.config.scopeType = "full_text";
  return payload;
}

async function validateDictionaryValues(
  supabase: SupabaseClient,
  payload: WizardPayload,
) {
  const config = payload.config;
  const expected = [
    ["request_channel", config.channelCode],
    ...config.serviceTypes.map((value) => ["service_type", value]),
    ...config.jurisdictionCodes.map((value) => ["jurisdiction", value]),
    ...(config.filingType ? [["filing_type", config.filingType]] : []),
    ...(config.filingApplicationType ? [["application_type", config.filingApplicationType]] : []),
    ...(config.entityType ? [["entity_type", config.entityType]] : []),
    ...(config.epvType ? [["epv_type", config.epvType]] : []),
  ] as Array<[string, string]>;
  const { data, error } = await supabase
    .from("dictionary_items")
    .select("category, code")
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const activeValues = new Set((data ?? []).map((item) => `${item.category}:${item.code}`));
  const builtInDictionaryValues = new Set([
    "filing_type:submission",
    "filing_type:annuity",
    "application_type:invention",
    "application_type:utility_model",
    "application_type:design",
    "application_type:trademark",
    "entity_type:large_entity",
    "entity_type:small_entity",
    "entity_type:micro_entity",
    ...jurisdictionOptions.map((option) => `jurisdiction:${option.value}`),
  ]);
  const invalid = expected.find(([category, code]) => {
    const key = `${category}:${code}`;
    return !activeValues.has(key) && !builtInDictionaryValues.has(key);
  });
  if (invalid) throw new Error(`Invalid ${invalid[0]} value: ${invalid[1]}.`);
}

function channelFromLegacyPurpose(purpose?: string) {
  if (purpose === "pct_national_phase") return "pct";
  if (purpose === "paris_convention") return "paris_convention";
  return "ep";
}

function purposeFromChannel(channelCode: string) {
  if (channelCode === "pct") return "pct_national_phase";
  if (channelCode === "paris_convention") return "paris_convention";
  return "european_validation";
}

async function upsertRequest(
  supabase: SupabaseClient,
  requestId: string,
  organizationId: string,
  userId: string,
  payload: WizardPayload,
  mode: "draft" | "submit",
) {
  const requestInput = {
    organization_id: organizationId,
    requester_id: userId,
    source_mode: payload.sourceMode,
    channel_code: payload.config.channelCode,
    title: null,
    workflow_stage: "draft",
    requester_status: mode === "draft" ? "responding" : "responding",
    pm_status: mode === "draft" ? "responding" : "responding",
    draft_payload: { ...payload, requestId },
    last_draft_step: payload.lastStep,
    submitted_at: null,
  };

  const writeRequest = () => {
    const query = payload.requestId
      ? supabase.from("translation_requests").update(requestInput).eq("id", requestId)
      : supabase.from("translation_requests").insert({
          id: requestId,
          ...requestInput,
        });

    return query.select("request_no").single();
  };

  let result = await writeRequest();
  if (result.error?.code === "42501") {
    await refreshAndVerifyRequestIdentity(supabase, userId, organizationId);
    result = await writeRequest();
  }

  if (result.error) {
    const operation = payload.requestId ? "update" : "insert";
    throw new Error(`Unable to ${operation} translation request: ${result.error.message}`);
  }

  return result.data.request_no;
}

async function refreshAndVerifyRequestIdentity(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
) {
  const { error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) {
    throw new Error("Your session has expired. Sign in again before creating a request.");
  }

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || claimsData?.claims?.sub !== userId) {
    throw new Error("Your signed-in account changed. Sign in again before creating a request.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error("Your requester organization access changed. Sign in again and retry.");
  }
}

async function persistSourceFiles(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  formData: FormData,
  reuseExistingUploadFiles: boolean,
  mode: "draft" | "submit",
) {
  if (payload.sourceMode === "upload") {
    if (reuseExistingUploadFiles) {
      return fetchExistingRequestFileIds(supabase, requestId);
    }
    return persistUploadedFiles(supabase, requestId, userId, formData);
  }
  return persistPatentSelection(supabase, requestId, payload, mode);
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

async function fetchExistingRequestFileIds(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data, error } = await supabase
    .from("request_files")
    .select("id")
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((file) => file.id);
}

async function reconcileDraftUploadFiles(
  supabase: SupabaseClient,
  requestId: string,
  uploadedFiles: WizardPayload["uploadedFiles"],
) {
  const { data, error } = await supabase
    .from("request_files")
    .select("id, storage_bucket, storage_path")
    .eq("request_id", requestId)
    .eq("source", "upload");

  if (error) throw new Error(error.message);

  const retainedIds = new Set(
    uploadedFiles.flatMap((file) => file.requestFileId ? [file.requestFileId] : []),
  );
  const removedFiles = (data ?? []).filter((file) => !retainedIds.has(file.id));
  if (!removedFiles.length) return;

  const pathsByBucket = new Map<string, string[]>();
  for (const file of removedFiles) {
    const paths = pathsByBucket.get(file.storage_bucket) ?? [];
    paths.push(file.storage_path);
    pathsByBucket.set(file.storage_bucket, paths);
  }

  for (const [bucket, paths] of pathsByBucket) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) throw new Error(storageError.message);
  }

  const { error: deleteError } = await supabase
    .from("request_files")
    .delete()
    .in("id", removedFiles.map((file) => file.id));
  if (deleteError) throw new Error(deleteError.message);
}

async function refreshDraftUploadPayload(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
) {
  const { data, error } = await supabase
    .from("request_files")
    .select("id, original_filename, mime_type, metadata")
    .eq("request_id", requestId)
    .eq("source", "upload")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const refreshedPayload: WizardPayload = {
    ...payload,
    requestId,
    uploadedFiles: (data ?? []).map((file) => ({
      requestFileId: file.id,
      name: file.original_filename,
      size: Number((file.metadata as { size?: number } | null)?.size ?? 0),
      type: file.mime_type ?? "",
    })),
  };
  const { error: updateError } = await supabase
    .from("translation_requests")
    .update({ draft_payload: refreshedPayload })
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);
  return refreshedPayload;
}

async function persistPatentSelection(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
  mode: "draft" | "submit",
) {
  const patent = payload.selectedPatent;
  if (!patent) return [];

  const searchId = randomUUID();
  const candidateId = randomUUID();
  const selectedFiles = resolvePatentFiles(payload);
  const analysis = payload.analysis;

  const { error: searchError } = await supabase.from("patent_searches").insert({
    id: searchId,
    request_id: requestId,
    query: payload.patentQuery ?? patent.patentNumber,
    detected_patent_type: "Publication",
    status: "completed",
    raw_response: stripPatentReceipts(patent.sourceSnapshot ?? patent),
  });
  if (searchError) throw new Error(searchError.message);

  const { error: candidateError } = await supabase.from("patent_candidates").insert({
    id: candidateId,
    search_id: searchId,
    patent_number: patent.patentNumber,
    title: patent.title,
    jurisdiction: patent.jurisdiction,
    application_no: patent.applicationNo,
    publication_no: patent.publicationNo,
    applicants: patent.applicants,
    metadata: stripPatentReceipts(patent),
  });
  if (candidateError) throw new Error(candidateError.message);

  const files = selectedFiles.map((file) => ({
    file,
    versionId: randomUUID(),
    requestFileId: randomUUID(),
  }));
  const writes = [
    supabase.from("request_patents").upsert({
      request_id: requestId,
      patent_number: patent.patentNumber,
      application_no: patent.applicationNo || null,
      publication_no: patent.publicationNo || null,
      title: patent.title || null,
      abstract: patent.description || null,
      jurisdiction: patent.jurisdiction || null,
      source: patent.source || null,
      applicants: patent.applicants,
      inventors: patent.inventors,
      filing_date: patent.filingDate || null,
      publication_date: patent.publicationDate || null,
      language: patent.language || null,
      first_priority_date: patent.firstPriorityDate || null,
      international_filing_date: patent.internationalFilingDate || null,
      filing_deadline_30_months: patent.filingDeadline30Months || null,
      filing_deadline_31_months: patent.filingDeadline31Months || null,
      total_pages: patent.totalPages ?? 0,
      legal_status: patent.legalStatus || null,
      ipc_codes: patent.ipcCodes ?? [],
      cpc_codes: patent.cpcCodes ?? [],
      abstract_word_count: analysis?.aggregate.abstract_words
        ?? patent.abstractWordCount
        ?? 0,
      description_word_count: analysis
        ? analysis.aggregate.description_words
          + analysis.aggregate.description_drawings_words
        : patent.descriptionWordCount ?? 0,
      claims_word_count: analysis?.aggregate.claims_words
        ?? patent.claimsWordCount
        ?? 0,
      claims_count: selectedFiles.reduce((sum, file) => sum + file.claimCount, 0),
      drawing_count: selectedFiles.reduce((sum, file) => sum + file.drawingCount, 0),
      source_snapshot: stripPatentReceipts(patent.sourceSnapshot ?? patent),
    }, { onConflict: "request_id" }),
  ];
  if (files.length) {
    writes.push(
      supabase.from("patent_file_versions").insert(files.map((entry) => ({
        id: entry.versionId,
        candidate_id: candidateId,
        version_label: entry.file.label,
        file_type: entry.file.fileType,
        language: entry.file.language,
        source_url: entry.file.sourceUrl,
        is_selected: true,
        metadata: entry.file,
      }))),
      supabase.from("request_files").insert(files.map((entry) => ({
        id: entry.requestFileId,
        request_id: requestId,
        source: "patent_search",
        storage_bucket: null,
        storage_path: null,
        original_filename: `${entry.file.label}.${entry.file.fileType}`,
        mime_type: entry.file.fileType === "txt"
          ? "text/plain"
          : "application/pdf",
        file_role: entry.file.label,
        language: entry.file.language,
        version_label: entry.file.label,
        confirmed_for_translation: true,
        status: mode === "submit" ? "parsing" : "validated",
        metadata: {
          source_url: entry.file.sourceUrl,
          patent_file: entry.file,
        },
      }))),
    );
  }
  const results = await Promise.all(writes);
  const writeError = results.find((result) => result.error)?.error;
  if (writeError) throw new Error(writeError.message);

  return files.map((entry) => entry.requestFileId);
}

async function assertEditableDraft(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("translation_requests")
    .select("id, workflow_stage, requester_id")
    .eq("id", requestId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || data.requester_id !== userId || data.workflow_stage !== "draft") {
    throw new Error("Draft request is no longer editable.");
  }
}

async function clearDraftSourceArtifacts(
  supabase: SupabaseClient,
  requestId: string,
) {
  const { data: requestFiles, error: requestFilesError } = await supabase
    .from("request_files")
    .select("id, source, storage_bucket, storage_path")
    .eq("request_id", requestId);

  if (requestFilesError) throw new Error(requestFilesError.message);

  const uploadedPaths = (requestFiles ?? [])
    .filter((file) => file.source === "upload" && file.storage_path)
    .map((file) => file.storage_path);

  if (uploadedPaths.length) {
    const { error: storageError } = await supabase.storage.from("request-files").remove(uploadedPaths);
    if (storageError) throw new Error(storageError.message);
  }

  const { error: deleteFilesError } = await supabase.from("request_files").delete().eq("request_id", requestId);
  if (deleteFilesError) throw new Error(deleteFilesError.message);

  const { error: deleteSearchesError } = await supabase.from("patent_searches").delete().eq("request_id", requestId);
  if (deleteSearchesError) throw new Error(deleteSearchesError.message);
  const { error: deletePatentError } = await supabase.from("request_patents").delete().eq("request_id", requestId);
  if (deletePatentError) throw new Error(deletePatentError.message);
}

async function clearIncompleteSubmissionArtifacts(
  supabase: SupabaseClient,
  requestId: string,
) {
  for (const table of [
    "quote_negotiations",
    "quotes",
    "request_config_versions",
    "translation_requirements",
  ] as const) {
    const { error } = await supabase.from(table).delete().eq("request_id", requestId);
    if (error) {
      throw new Error(`Unable to clean incomplete ${table}: ${error.message}`);
    }
  }
}

async function persistSubmissionArtifacts(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  requestFileIds: string[],
  finalizeSubmission: boolean,
) {
  await createParseResults(supabase, requestFileIds, payload);
  const requirementId = randomUUID();
  await createRequirement(supabase, requestId, requirementId, payload);
  const configId = randomUUID();
  await createConfigVersion(supabase, requestId, requirementId, configId, userId, payload);
  const [configFilesResult] = await Promise.all([
    requestFileIds.length
      ? supabase.from("request_config_files").insert(
          requestFileIds.map((fileId) => ({
            config_version_id: configId,
            request_file_id: fileId,
          })),
        )
      : Promise.resolve({ error: null }),
    createInitialQuote(
      supabase,
      requestId,
      userId,
      payload,
      requestFileIds,
      finalizeSubmission,
    ),
  ]);
  if (configFilesResult.error) {
    throw new Error(configFilesResult.error.message);
  }
}

async function createParseResults(
  supabase: SupabaseClient,
  requestFileIds: string[],
  payload: WizardPayload,
) {
  const selectedPatentFiles = resolvePatentFiles(payload);
  const analysisFiles = payload.analysis?.files ?? [];
  const rows = requestFileIds.map((fileId, index) => {
    const patentFile = selectedPatentFiles[index];
    const analysisFile = payload.sourceMode === "patent_search"
      ? analysisFiles[index] ?? analysisFiles[0]
      : undefined;
    const analysisStatus = payload.analysis?.status ?? analysisFile?.status;
    const hasRealPatentAnalysis = payload.sourceMode === "patent_search"
      && Boolean(analysisFile);
    const timestamp = new Date().toISOString();
    return {
      job: {
        file_id: fileId,
        status: analysisStatus === "partial" ? "needs_review" : "success",
        attempt_count: 1,
        started_at: timestamp,
        finished_at: timestamp,
        payload: hasRealPatentAnalysis
          ? {
              input_mode: "patent_number",
              status: analysisStatus,
              warnings: payload.analysis?.warnings ?? [],
            }
          : { todo: "Replace upload parse preview with async parser worker." },
      },
      result: {
        file_id: fileId,
        parse_status: analysisStatus === "partial" ? "needs_review" : "completed",
        word_count: analysisFile?.total_words ?? patentFile?.wordCount ?? 12000,
        page_count: patentFile?.pageCount ?? 0,
        claim_count: patentFile?.claimCount ?? 0,
        technical_fields: [payload.selectedPatent?.technicalField ?? "patent"],
        structure_json: analysisFile
          ? {
              parts: analysisFile.parts,
              document_text_words: analysisFile.document_text_words,
              drawing_ocr_words: analysisFile.drawing_ocr_words,
              aggregate: payload.analysis?.aggregate,
              warnings: analysisFile.warnings,
            }
          : { sections: ["abstract", "description", "claims"] },
        ocr_required: false,
        manual_review_required: false,
      },
    };
  });
  if (!rows.length) return;

  const [jobs, results] = await Promise.all([
    supabase.from("file_parse_jobs").insert(rows.map((row) => row.job)),
    supabase.from("file_parse_results").insert(rows.map((row) => row.result)),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (results.error) throw new Error(results.error.message);
}

function stripPatentReceipts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripPatentReceipts);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["lookupReceipt", "lookup_receipt", "analysis_receipt"].includes(key))
      .map(([key, entry]) => [key, stripPatentReceipts(entry)]),
  );
}

function resolvePatentFiles(payload: WizardPayload) {
  const patentFiles = payload.selectedPatent?.downloadableFiles ?? [];
  const selectedPatentFiles = patentFiles.filter((file) =>
    payload.selectedPatentFileIds.includes(file.id),
  );

  return selectedPatentFiles.length > 0 ? selectedPatentFiles : patentFiles;
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
    target_language: config.sourceLanguage,
    target_languages: [config.sourceLanguage],
    scope_type: "full_text",
    scope_details: { customScope: config.customScope },
    purpose: purposeFromChannel(config.channelCode),
    service_types: config.serviceTypes,
    entity_type: config.entityType || null,
    filing_type_code: config.filingType || null,
    application_type_code: config.filingApplicationType || null,
    entity_type_code: config.entityType || null,
    epv_type_code: config.epvType || null,
    jurisdiction_codes: config.jurisdictionCodes,
    quality_level: config.qualityLevel,
    delivery_option: DEFAULT_DELIVERY_OPTION,
    due_at: config.dueAt || null,
    is_urgent: config.isUrgent,
    terminology_notes: null,
    config_snapshot: {
      ...config,
      scopeType: "full_text",
    },
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
    config_snapshot: {
      ...payload.config,
      scopeType: "full_text",
    },
    created_by: userId,
  });
}

async function createInitialQuote(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  requestFileIds: string[],
  finalizeSubmission: boolean,
) {
  const [filesResult, versionNo] = await Promise.all([
    supabase
      .from("request_files")
      .select("id, file_parse_results(word_count, page_count, claim_count, technical_fields)")
      .in("id", requestFileIds),
    nextVersion(supabase, "quotes", requestId),
  ]);
  const { data: files, error: filesError } = filesResult;

  if (filesError) throw new Error(filesError.message);

  const wordCount = sumParseMetric(files ?? [], "word_count");
  const usesTranslationQuality = payload.config.serviceTypes.includes("translation")
    || payload.config.serviceTypes.includes("epv");
  const amount = calculateQuote(
    wordCount,
    usesTranslationQuality ? payload.config.qualityLevel : "",
    payload.config.isUrgent,
  );
  const pricingSnapshot = {
    source: "requester_wizard_preview",
    wordCount,
    channelCode: payload.config.channelCode,
    serviceTypes: payload.config.serviceTypes,
    jurisdictionCodes: payload.config.jurisdictionCodes,
    qualityLevel: usesTranslationQuality ? payload.config.qualityLevel : null,
    urgent: payload.config.isUrgent,
    deliveryOption: DEFAULT_DELIVERY_OPTION,
    dueAt: payload.config.dueAt || null,
    filingType: payload.config.filingType || null,
    applicationType: payload.config.filingApplicationType || null,
    entityType: payload.config.entityType || null,
    epvType: payload.config.epvType || null,
  };

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      request_id: requestId,
      version_no: versionNo,
      status: "accepted",
      currency: "USD",
      total_amount: amount,
      estimated_delivery_at: payload.config.dueAt || null,
      valid_until: new Date(Date.now() + 7 * 86400000).toISOString(),
      notes: "Generated from the requester quote preview.",
      pricing_snapshot: pricingSnapshot,
      breakdown_json: pricingSnapshot,
    })
    .select("id")
    .single();

  if (quoteError) throw new Error(quoteError.message);

  const serviceTypes = payload.config.serviceTypes.length
    ? payload.config.serviceTypes
    : ["translation"];
  const baseItemAmount = Math.floor((amount * 100) / serviceTypes.length) / 100;
  const quoteItems = serviceTypes.map((serviceType, index) => ({
    quote_id: quote.id,
    label: serviceTypeLabel(serviceType),
    amount: index === serviceTypes.length - 1
      ? Number((amount - baseItemAmount * index).toFixed(2))
      : baseItemAmount,
    quantity: serviceType === "translation" && wordCount ? wordCount : 1,
    unit: serviceType === "translation" && wordCount ? "word" : "project",
    description: "Initial quote item generated from the submitted request configuration.",
  }));
  const [quoteItemResult, factorResult] = await Promise.all([
    supabase.from("quote_items").insert(quoteItems),
    supabase.from("quote_factor_snapshots").insert({
      quote_id: quote.id,
      factors: {
        ...pricingSnapshot,
        amount,
      },
    }),
  ]);
  const { error: quoteItemError } = quoteItemResult;
  if (quoteItemError) throw new Error(quoteItemError.message);

  const { error: factorError } = factorResult;
  if (factorError) throw new Error(factorError.message);

  const { error: requestError } = await supabase
    .from("translation_requests")
    .update({
      workflow_stage: finalizeSubmission ? "quoted" : "draft",
      requester_status: "responding",
      pm_status: "responding",
      submitted_at: finalizeSubmission ? new Date().toISOString() : null,
    })
    .eq("id", requestId);
  if (requestError) {
    throw new Error(`Unable to finalize translation request: ${requestError.message}`);
  }

  if (finalizeSubmission) {
    await writeRequestEvent(
      supabase,
      requestId,
      userId,
      "quote.accepted.requester_preview",
      "configured",
      "quoted",
      { quoteId: quote.id, amount, currency: "USD" },
    );
  }
}

function serviceTypeLabel(serviceType: string) {
  const labels: Record<string, string> = {
    translation: "Translation",
    filing: "Filing",
    european_patent_grant_registration: "European Patent Grant Registration",
    epv: "EPV",
  };
  return labels[serviceType] ?? serviceType;
}
