import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  type ActionResult,
  validateFutureDateString,
  validateUploadFiles,
} from "@/lib/validators/requester";
import type { WizardPayload, WizardPersistResult } from "@/features/requester/wizard-types";
import { buildWizardDraftPayloadV2 } from "@/features/requester/draft-v2";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";
import {
  HUMAN_TRANSLATION_QUALITY_LEVEL,
  jurisdictionOptions,
} from "@/features/requester/options";
import {
  isAllowedServiceTypeConfig,
  isTraditionalValidation,
  requiresEpCountries,
} from "@/features/requester/request-paths";
import {
  normalizeEpoTargetLanguages,
  normalizeWizardConfig,
  requiresSourceLanguage,
} from "@/features/requester/components/new-request-wizard-utils";
import {
  getAuthenticatedUser,
  getRequesterOrganization,
  safeFileName,
  toErrorMessage,
} from "../server-utils";
import {
  inferFileRole,
  inferLanguage,
  nextVersion,
  writeRequestEvent,
} from "./helpers";
import { quoteValidUntilTimestamp } from "@/lib/eci-erp/ep-granting-quote";
import type { ErpQuotePreview } from "@/lib/eci-erp/types";
import {
  isEpGrantingTranslation,
  requiresCustomerTifg,
  requiresPatentDocumentAnalysis,
} from "@/features/requester/epo-tifg-upload";
import {
  verifyWizardPatentPayload,
} from "./patent-service";
import {
  enqueueSubmittedPatentFilePreparation,
  persistDraftPatentFile,
} from "./patent-file-readiness";
import {
  QuoteEstimateReceiptError,
  verifyQuoteEstimateReceipt,
} from "./quote-receipt";
import { measureServerOperation } from "@/lib/performance/server-timing";
import { getRequesterDictionaries } from "@/features/requester/queries";

type SupabaseClient = Awaited<ReturnType<typeof getAuthenticatedUser>>["supabase"];
type WizardSubmissionTimings = {
  auth_ms?: number;
  validation_ms?: number;
  request_write_ms?: number;
  existing_submission_check_ms?: number;
  draft_prepare_ms?: number;
  source_files_ms?: number;
  submission_ms?: number;
  parse_results_ms?: number;
  submit_rpc_ms?: number;
  event_ms?: number;
};

const DEFAULT_DELIVERY_OPTION = "standard";

export async function persistWizardRequest(
  formData: FormData,
  mode: "draft" | "submit",
  options?: {
    deferPatentCache?: boolean;
    deferFormalSubmission?: boolean;
  },
): Promise<ActionResult<WizardPersistResult>> {
  const timings: WizardSubmissionTimings = {};
  return measureServerOperation(`requester.wizard.${mode}`, () =>
    persistWizardRequestInternal(formData, mode, options, timings), timings);
}

async function persistWizardRequestInternal(
  formData: FormData,
  mode: "draft" | "submit",
  options: {
    deferPatentCache?: boolean;
    deferFormalSubmission?: boolean;
  } | undefined,
  timings: WizardSubmissionTimings,
): Promise<ActionResult<WizardPersistResult>> {
  let persistedResult: WizardPersistResult | undefined;
  try {
    let payload = parseWizardPayload(formData);
    // Draft saving still validates against the stable dictionary cache. Submit
    // receipts are only issued after the same validation during quote creation.
    const dictionariesPromise = mode === "draft" ? getRequesterDictionaries() : null;
    const { supabase, userId, organization, supplierOrganizationId } =
      await measureWizardStage(timings, "auth_ms", () => getRequesterOrganization());
    if (!organization || !supplierOrganizationId) {
      throw new Error("Your organization is not linked to a supplier.");
    }
    const verifiedQuote = mode === "submit"
      ? verifyQuoteEstimateReceipt({
          userId,
          organizationId: organization.id,
          payload,
        })
      : null;
    const durableDraftFileIds = payload.sourceMode === "patent_search"
      && Boolean(payload.requestId)
      && !isEpGrantingTranslation(payload.config)
      ? await getDurableDraftPatentFileIds(
        supabase,
        payload.requestId!,
        payload.selectedPatent?.patentNumber,
        requiresPatentDocumentAnalysis(payload.config),
      )
      : null;
    const reuseDurablePatent = durableDraftFileIds !== null;
    payload = await measureWizardStage(timings, "validation_ms", async () => {
      if (mode !== "draft") {
        // A current signed estimate is minted only after
        // validateWizardSubmitConfiguration succeeds. Its payload hash binds
        // the exact configuration presented here, so repeat validation would
        // add latency without providing additional protection.
        if (!reuseDurablePatent && !verifiedQuote) {
          payload = await verifyWizardPatentPayload(payload);
        }
      } else {
        await validateWizardSubmitConfiguration(payload, await dictionariesPromise!);
        if (
          payload.sourceMode === "patent_search"
          && payload.selectedPatent
          && payload.analysis?.analysis_receipt
          && !isEpGrantingTranslation(payload.config)
          && !reuseDurablePatent
        ) {
          payload = await verifyWizardPatentPayload(payload);
        }
      }
      return payload;
    });

    const requestId = payload.requestId ?? randomUUID();
    const uploadedFormFiles = formData.getAll("files").filter((file): file is File => file instanceof File);
    validateUploadFiles(uploadedFormFiles);
    const usesCustomerTifg = payload.sourceMode === "patent_search"
      && isEpGrantingTranslation(payload.config);
    validateCustomerTifgFiles(payload, uploadedFormFiles, mode);
    const submittedRequestNo = mode === "submit"
      && payload.requestId
      && payload.sourceMode === "patent_search"
      && !options?.deferFormalSubmission
      && !options?.deferPatentCache
      ? await measureWizardStage(timings, "existing_submission_check_ms", () => findSubmittedPatentRequest(
          supabase,
          requestId,
          userId,
        ))
      : null;
    if (submittedRequestNo) {
      persistedResult = { requestId, requestNo: submittedRequestNo };
      after(() => revalidateSubmittedRequestPaths(requestId));
      return { success: true, data: persistedResult };
    }
    const reuseExistingUploadFiles = Boolean(payload.requestId)
      && (payload.sourceMode === "upload" || usesCustomerTifg)
      && uploadedFormFiles.length === 0
      && payload.uploadedFiles.some((file) => Boolean(file.requestFileId));

    if (payload.requestId) {
      await measureWizardStage(timings, "draft_prepare_ms", async () => {
        await assertEditableDraft(supabase, requestId, userId);
        if (reuseExistingUploadFiles) {
          await reconcileDraftUploadFiles(
            supabase,
            requestId,
            payload.uploadedFiles,
          );
        } else if (!reuseDurablePatent) {
          await clearDraftSourceArtifacts(supabase, requestId);
        }
      });
    }

    const batchPatentWrites = mode === "submit"
      && payload.sourceMode === "patent_search"
      && !usesCustomerTifg
      && !reuseDurablePatent;
    const batchedPatentResult = batchPatentWrites
      ? await measureWizardStage(timings, "request_write_ms", () =>
          upsertRequestAndPatentSource(
            supabase,
            requestId,
            organization.id,
            supplierOrganizationId,
            userId,
            payload,
          ))
      : null;
    const requestNo = batchedPatentResult?.requestNo ?? await measureWizardStage(
      timings,
      "request_write_ms",
      () => upsertRequest(
        supabase,
        requestId,
        organization.id,
        supplierOrganizationId,
        userId,
        payload,
        mode,
      ),
    );
    const requestFileIds = batchedPatentResult?.requestFileIds ?? await measureWizardStage(
      timings,
      "source_files_ms",
      () => reuseDurablePatent
        ? Promise.resolve(durableDraftFileIds ?? [])
        : persistSourceFiles(
            supabase,
            requestId,
            userId,
            payload,
            formData,
            reuseExistingUploadFiles,
            mode,
          ),
    );
    persistedResult = { requestId, requestNo };
    if (
      mode === "draft"
      && payload.sourceMode === "patent_search"
      && payload.selectedPatent
      && payload.analysis?.analysis_receipt
      && !usesCustomerTifg
      && !reuseDurablePatent
    ) {
      await persistDraftPatentFile({
        supabase,
        requestId,
        lookupReceipt: payload.selectedPatent.lookupReceipt!,
        analysisReceipt: payload.analysis!.analysis_receipt!,
      });
      await createParseResults(supabase, requestFileIds, payload);
    }
    if (
      mode === "draft"
      && payload.sourceMode === "patent_search"
      && usesCustomerTifg
      && payload.analysis?.analysis_receipt
      && !reuseDurablePatent
    ) {
      await createParseResults(supabase, requestFileIds, payload);
    }
    if (
      mode === "draft"
      && (payload.sourceMode === "upload" || usesCustomerTifg)
    ) {
      payload = await refreshDraftUploadPayload(supabase, requestId, payload);
    }

    if (mode === "draft") {
      await clearIncompleteSubmissionArtifacts(supabase, requestId);
      await persistDraftConfigurationArtifacts(
        supabase,
        requestId,
        userId,
        payload,
        requestFileIds,
      );
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
      await measureWizardStage(timings, "submission_ms", () => persistSubmissionArtifacts(
        supabase,
        requestId,
        payload,
        requestFileIds,
        !options?.deferFormalSubmission,
        reuseDurablePatent || batchPatentWrites || (
          payload.sourceMode === "patent_search"
          && !usesCustomerTifg
          && requiresPatentDocumentAnalysis(payload.config)
        ),
        verifiedQuote,
        timings,
      ));
      if (
        payload.sourceMode === "patent_search"
        && !options?.deferPatentCache
        && payload.analysis?.analysis_receipt
        && !reuseDurablePatent
        && !usesCustomerTifg
      ) {
        scheduleSubmittedPatentFile({
          supabase,
          requestId,
          userId,
          lookupReceipt: payload.selectedPatent!.lookupReceipt!,
          analysisReceipt: payload.analysis!.analysis_receipt!,
        });
      } else if (
        payload.sourceMode === "upload"
        && !options?.deferPatentCache
        && payload.analysis?.analysis_receipt
      ) {
        scheduleSubmittedPatentFile({
          supabase,
          requestId,
          userId,
          analysisReceipt: payload.analysis.analysis_receipt,
        });
      }
    }

    scheduleSubmissionFollowUp({
      supabase,
      requestId,
      userId,
      sourceMode: payload.sourceMode,
      lastStep: payload.lastStep,
      writeSubmissionEvent: mode === "submit" && !options?.deferFormalSubmission,
    });
    return { success: true, data: persistedResult };
  } catch (error) {
    return {
      success: false,
      data: persistedResult,
      error: toErrorMessage(error),
      code: error instanceof QuoteEstimateReceiptError
        ? error.code
        : mode === "submit"
          ? "SUBMIT_TRANSACTION_FAILED"
          : undefined,
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
  lookupReceipt?: string;
  analysisReceipt: string;
}) {
  const startedAt = performance.now();
  try {
    await enqueueSubmittedPatentFilePreparation(input);
    console.info(JSON.stringify({
      event: "requester.patent_cache.prepare",
      success: true,
      total_ms: roundDuration(performance.now() - startedAt),
    }));
  } catch (cacheError) {
    console.warn(JSON.stringify({
      event: "requester.patent_cache.prepare",
      success: false,
      total_ms: roundDuration(performance.now() - startedAt),
      error: toErrorMessage(cacheError),
    }));
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

function scheduleSubmissionFollowUp(input: {
  supabase: SupabaseClient;
  requestId: string;
  userId: string;
  sourceMode: WizardPayload["sourceMode"];
  lastStep: string;
  writeSubmissionEvent: boolean;
}) {
  after(async () => {
    if (input.writeSubmissionEvent) {
      try {
        await writeRequestEvent(
          input.supabase,
          input.requestId,
          input.userId,
          "request.submitted.from_wizard",
          "draft",
          "quoted",
          { sourceMode: input.sourceMode, lastStep: input.lastStep },
        );
      } catch (error) {
        console.error("Unable to write submission event after response", error);
      }
    }
    revalidateSubmittedRequestPaths(input.requestId);
  });
}

function revalidateSubmittedRequestPaths(requestId: string) {
  revalidatePath("/requester/requests");
  revalidatePath(`/requester/requests/${requestId}`);
  revalidatePath(`/requester/requests/${requestId}/quote`);
}

async function measureWizardStage<T>(
  timings: WizardSubmissionTimings,
  field: keyof WizardSubmissionTimings,
  operation: () => Promise<T>,
) {
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    timings[field] = roundDuration(performance.now() - startedAt);
  }
}

function roundDuration(value: number) {
  return Math.round(value * 100) / 100;
}

function validateCommercialFields(payload: WizardPayload) {
  const config = payload.config;
  if (requiresCustomerTifg({
    channelCode: config.channelCode,
    epServiceType: config.epServiceType,
    translationRequired: config.translationRequired,
    analysis: payload.analysis,
  })) {
    throw new Error(
      "Upload and verify the TIFG clean-copy PDF before submitting EP Granting.",
    );
  }
  if (
    config.channelCode === "ep"
    && requiresEpCountries(config.epServiceType, config.serviceItem)
    && (!config.epCountryIds.length || !config.epCountriesConfirmed)
  ) {
    throw new Error("Select at least one EP country.");
  }
  if (config.channelCode !== "ep" && !config.jurisdictionCodes.length) {
    throw new Error("Select at least one jurisdiction.");
  }
  if (
    !isAllowedServiceTypeConfig(
      config.channelCode,
      config.serviceTypes,
      config.epvType,
      config.epServiceType,
    )
  ) {
    throw new Error("Select a service type available for the chosen path.");
  }
  if (config.serviceTypes.includes("filing")) {
    if (!config.filingType || !config.filingApplicationType || !config.entityType) {
      throw new Error("Filing type, application type, and entity type are required for filing.");
    }
  }
  if (config.serviceTypes.includes("epv") && !config.epvType) {
    throw new Error("EPV type is required for EPV.");
  }
  if (isTraditionalValidation(config.epServiceType) && !config.serviceItem) {
    throw new Error("Service Item is required for Traditional Validation.");
  }
  if (requiresSourceLanguage(config) && !config.sourceLanguage) {
    throw new Error("Source language is required for this EPO service.");
  }
  if (config.channelCode === "ep") {
    const normalizedTargets = normalizeEpoTargetLanguages(
      config.epServiceType,
      config.translationRequired,
      config.sourceLanguage,
      config.targetLanguages,
    );
    if (normalizedTargets.join("|") !== config.targetLanguages.join("|")) {
      throw new Error("Target languages do not match the selected EPO service rule.");
    }
    if (config.translationRequired !== config.serviceTypes.includes("translation")) {
      throw new Error("Translation configuration is inconsistent.");
    }
  }
  if (
    config.channelCode === "pct"
    && config.serviceTypes.includes("filing")
    && !["chapter_i", "chapter_ii"].includes(config.pctChapter ?? "")
  ) {
    throw new Error("PCT Chapter I or Chapter II is required for PCT filing.");
  }
}

function parseWizardPayload(formData: FormData): WizardPayload {
  const payload = JSON.parse(String(formData.get("payload") ?? "")) as WizardPayload;
  if (!["patent_search", "upload"].includes(payload.sourceMode)) {
    throw new Error("Choose a valid file source.");
  }
  payload.config = normalizeWizardConfig({
    ...payload.config,
    channelCode: payload.config.channelCode
      || channelFromLegacyPurpose(payload.config.purpose),
  });
  const hasPctFilingService = payload.config.channelCode === "pct"
    && payload.config.serviceTypes.includes("filing");
  if (
    hasPctFilingService
    && payload.config.pctChapter
    && !["chapter_i", "chapter_ii"].includes(payload.config.pctChapter)
  ) {
    throw new Error("Choose a valid PCT Chapter I or Chapter II value.");
  }
  payload.config.pctChapter = hasPctFilingService
    && payload.config.pctChapter === "chapter_ii"
    ? "chapter_ii"
    : hasPctFilingService
      ? "chapter_i"
      : "";
  const isTranslationOnlyService = payload.config.serviceTypes.length === 1
    && payload.config.serviceTypes[0] === "translation";
  payload.config.dueAt = isTranslationOnlyService
    ? payload.config.dueAt?.trim() ?? ""
    : "";
  if (payload.config.channelCode === "ep") {
    payload.config.jurisdictionCodes = [];
    payload.config.optOutCountryIds = [];
    payload.config.optOutCountriesConfirmed = false;
  } else {
    payload.config.epCountryIds = [];
    payload.config.optOutCountryIds = [];
  }
  payload.config.scopeType = "full_text";
  payload.config.qualityLevel = HUMAN_TRANSLATION_QUALITY_LEVEL;
  return payload;
}

export async function validateWizardSubmitConfiguration(
  payload: WizardPayload,
  dictionaries?: Awaited<ReturnType<typeof getRequesterDictionaries>>,
) {
  const activeDictionaries = dictionaries ?? await getRequesterDictionaries();
  validateCommercialFields(payload);
  validateFutureDateString(payload.config.dueAt, "Due date");
  validateDictionaryValues(activeDictionaries, payload);
  validateCombinationTranslationTargets(activeDictionaries.epCountries, payload);
  validateEpoServiceAvailability(payload);
}

function validateCombinationTranslationTargets(
  epCountries: Awaited<ReturnType<typeof getRequesterDictionaries>>["epCountries"],
  payload: WizardPayload,
) {
  const { config } = payload;
  if (
    config.epServiceType !== "traditional_validation_unitary_patent"
    || !config.translationRequired
    || !config.epCountryIds.length
  ) return;
  const countriesById = new Map(epCountries.map((country) => [country.id, country]));
  const selectedCountries = config.epCountryIds.map((id) => countriesById.get(id));
  if (selectedCountries.some((country) => !country)) {
    throw new Error("Unable to validate the selected EP countries.");
  }
  const hasFullTextTraditionalCountry = selectedCountries.some(
    (country) => country!.epvTranslationRequirement === 2,
  );
  if (hasFullTextTraditionalCountry && config.targetLanguages.length) {
    throw new Error(
      "Target languages must be empty when a selected Traditional Validation country requires full-text translation.",
    );
  }
  if (!hasFullTextTraditionalCountry && !config.targetLanguages.length) {
    throw new Error("Select a target language for the Unitary Patent service.");
  }
}

function validateEpoServiceAvailability(payload: WizardPayload) {
  if (payload.config.channelCode !== "ep" || !payload.config.epServiceType) return;
  const availability = getEpoServiceAvailability(
    payload.config.epServiceType,
    payload.selectedPatent,
    payload.analysis,
  );
  if (!availability.available) {
    throw new Error(
      availability.reason ?? "The selected EPO service is not currently available.",
    );
  }
}

function validateDictionaryValues(
  dictionaries: Awaited<ReturnType<typeof getRequesterDictionaries>>,
  payload: WizardPayload,
) {
  const config = payload.config;
  const expected = [
    ["request_channel", config.channelCode],
    ...config.serviceTypes.map((value) => ["service_type", value]),
    ...(config.channelCode === "ep"
      ? []
      : config.jurisdictionCodes.map((value) => ["jurisdiction", value])),
    ...(config.filingType ? [["filing_type", config.filingType]] : []),
    ...(config.filingApplicationType ? [["application_type", config.filingApplicationType]] : []),
    ...(config.entityType ? [["entity_type", config.entityType]] : []),
    ...(config.epvType ? [["epv_type", config.epvType]] : []),
  ] as Array<[string, string]>;
  const activeValues = new Set([
    ...dictionaries.channels.map((item) => `request_channel:${item.value}`),
    ...dictionaries.serviceTypes.map((item) => `service_type:${item.value}`),
    ...dictionaries.filingTypes.map((item) => `filing_type:${item.value}`),
    ...dictionaries.applicationTypes.map((item) => `application_type:${item.value}`),
    ...dictionaries.entityTypes.map((item) => `entity_type:${item.value}`),
    ...dictionaries.epvTypes.map((item) => `epv_type:${item.value}`),
    ...dictionaries.jurisdictions.map((item) => `jurisdiction:${item.value}`),
  ]);
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

  if (config.channelCode === "ep" && config.epCountryIds.length) {
    const activeCountryIds = new Set(dictionaries.epCountries.map((country) => country.id));
    const invalidCountryId = config.epCountryIds.find((id) => !activeCountryIds.has(id));
    if (invalidCountryId) {
      throw new Error(`Invalid or disabled EP country id: ${invalidCountryId}.`);
    }
  }
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
  supplierOrganizationId: string,
  userId: string,
  payload: WizardPayload,
  mode: "draft" | "submit",
) {
  const requestInput = {
    organization_id: organizationId,
    supplier_organization_id: supplierOrganizationId,
    requester_id: userId,
    reference_no: payload.referenceNo?.trim() || null,
    source_mode: payload.sourceMode,
    channel_code: payload.config.channelCode,
    title: null,
    workflow_stage: "draft",
    requester_status: mode === "draft" ? "responding" : "responding",
    pm_status: mode === "draft" ? "responding" : "responding",
    draft_payload: buildWizardDraftPayloadV2(payload),
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
  const usesCustomerTifg = isEpGrantingTranslation(payload.config);
  if (mode === "draft" && !payload.analysis?.analysis_receipt && !usesCustomerTifg) {
    await persistPatentSelection(supabase, requestId, payload, mode, false);
    return [];
  }
  if (!requiresPatentDocumentAnalysis(payload.config)) {
    return persistPatentSelection(supabase, requestId, payload, mode, false);
  }
  const patentFileIds = await persistPatentSelection(
    supabase,
    requestId,
    payload,
    mode,
    !usesCustomerTifg,
  );
  if (!usesCustomerTifg) {
    return patentFileIds;
  }
  if (reuseExistingUploadFiles) {
    return fetchExistingRequestFileIds(supabase, requestId);
  }
  return persistUploadedFiles(supabase, requestId, userId, formData);
}

async function upsertRequestAndPatentSource(
  supabase: SupabaseClient,
  requestId: string,
  organizationId: string,
  supplierOrganizationId: string,
  userId: string,
  payload: WizardPayload,
) {
  const patent = payload.selectedPatent;
  if (!patent) throw new Error("Search for a patent before submitting.");
  const persistedPatent = stripPatentReceipts(patent) as Record<string, unknown>;
  const { data, error } = await supabase.rpc("upsert_draft_request_and_patent_source", {
    p_request_id: requestId,
    p_request: {
      organization_id: organizationId,
      supplier_organization_id: supplierOrganizationId,
      requester_id: userId,
      reference_no: payload.referenceNo?.trim() || "",
      channel_code: payload.config.channelCode,
      draft_payload: buildWizardDraftPayloadV2(payload),
      last_draft_step: payload.lastStep,
    },
    p_patent: {
      ...persistedPatent,
      patentQuery: payload.patentQuery,
    },
    p_analysis: payload.analysis ?? {},
    p_files: requiresPatentDocumentAnalysis(payload.config)
      ? resolvePatentFiles(payload)
      : [],
    p_create_parse_results: requiresPatentDocumentAnalysis(payload.config),
  });
  if (error) throw new Error(error.message);
  const result = data as { request_no?: string; request_file_ids?: string[] } | null;
  if (!result?.request_no) throw new Error("Unable to persist the Request source package.");
  return {
    requestNo: result.request_no,
    requestFileIds: result.request_file_ids ?? [],
  };
}

function validateCustomerTifgFiles(
  payload: WizardPayload,
  files: File[],
  mode: "draft" | "submit",
) {
  if (payload.sourceMode !== "patent_search" || !isEpGrantingTranslation(payload.config)) {
    return;
  }

  if (files.length > 1 || payload.uploadedFiles.length > 1) {
    throw new Error("Upload exactly one TIFG clean-copy PDF.");
  }
  const names = [
    ...files.map((file) => file.name),
    ...payload.uploadedFiles.map((file) => file.name),
  ];
  if (names.some((name) => !name.toLowerCase().endsWith(".pdf"))) {
    throw new Error("The TIFG clean copy must be uploaded as a PDF.");
  }
  const mimeTypes = [
    ...files.map((file) => file.type),
    ...payload.uploadedFiles.map((file) => file.type),
  ].filter(Boolean);
  if (mimeTypes.some((mimeType) => mimeType !== "application/pdf")) {
    throw new Error("The TIFG clean copy must be uploaded as a PDF.");
  }

  const hasNewFile = files.length === 1;
  const hasStoredFile = payload.uploadedFiles.length === 1
    && Boolean(payload.uploadedFiles[0].requestFileId);
  if (mode === "submit" && !hasNewFile && !hasStoredFile) {
    throw new Error("Upload exactly one TIFG clean-copy PDF before submitting.");
  }
}

async function persistUploadedFiles(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  formData: FormData,
) {
  const files = formData.getAll("files").filter((file): file is File => file instanceof File);
  const completed: Array<{ id: string; path: string }> = [];
  let nextIndex = 0;
  let firstError: unknown;

  const workers = Array.from({ length: Math.min(3, files.length) }, async () => {
    while (!firstError) {
      const index = nextIndex++;
      if (index >= files.length) return;
      try {
        completed.push(await persistOneUploadedFile(
          supabase,
          requestId,
          userId,
          files[index],
        ));
      } catch (error) {
        firstError = error;
      }
    }
  });
  await Promise.all(workers);

  if (firstError) {
    if (completed.length) {
      await Promise.all([
        supabase.from("request_files").delete().in("id", completed.map((file) => file.id)),
        supabase.storage.from("request-files").remove(completed.map((file) => file.path)),
      ]);
    }
    throw firstError;
  }

  return completed.map((file) => file.id);
}

async function persistOneUploadedFile(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  file: File,
) {
  const fileId = randomUUID();
  const path = `${userId}/${requestId}/${fileId}-${safeFileName(file.name)}`;
  const content = new Uint8Array(await file.arrayBuffer());
  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const { error: uploadError } = await supabase.storage.from("request-files").upload(
    path,
    content,
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
    content_sha256: contentSha256,
  });
  if (error) {
    await supabase.storage.from("request-files").remove([path]);
    throw new Error(error.message);
  }
  return { id: fileId, path };
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
    .update({ draft_payload: buildWizardDraftPayloadV2(refreshedPayload) })
    .eq("id", requestId);

  if (updateError) throw new Error(updateError.message);
  return refreshedPayload;
}

async function persistPatentSelection(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
  mode: "draft" | "submit",
  includePatentFiles = true,
) {
  const patent = payload.selectedPatent;
  if (!patent) return [];
  const selectedFiles = includePatentFiles ? resolvePatentFiles(payload) : [];
  const persistedPatent = stripPatentReceipts(patent) as Record<string, unknown>;
  const sourceInput = {
    p_request_id: requestId,
    p_patent: {
      ...persistedPatent,
      patentQuery: payload.patentQuery,
    },
    p_analysis: payload.analysis ?? {},
    p_files: selectedFiles,
  };
  const { data, error } = mode === "submit" && includePatentFiles
    ? await supabase.rpc("persist_patent_source_and_parse_for_wizard", sourceInput)
    : await supabase.rpc("persist_patent_source_for_wizard", {
        ...sourceInput,
        p_submit: mode === "submit",
      });
  if (error) throw new Error(error.message);
  return (data ?? []) as string[];
}

async function getDurableDraftPatentFileIds(
  supabase: SupabaseClient,
  requestId: string,
  patentNumber: string | undefined,
  requiresFiles: boolean,
) {
  if (!patentNumber) return null;
  const { data, error } = await supabase.rpc("get_durable_draft_patent_file_ids", {
    p_request_id: requestId,
    p_patent_number: patentNumber,
    p_requires_files: requiresFiles,
  });
  if (error) throw new Error(error.message);
  return data as string[] | null;
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
  payload: WizardPayload,
  requestFileIds: string[],
  finalizeSubmission: boolean,
  reuseExistingParseResults = false,
  verifiedQuote: ErpQuotePreview | null = null,
  timings: WizardSubmissionTimings,
) {
  if (!verifiedQuote) {
    throw new QuoteEstimateReceiptError(
      "QUOTE_ESTIMATE_INVALID",
      "Generate a current estimate before submitting this Request.",
    );
  }
  if (!reuseExistingParseResults) {
    await measureWizardStage(timings, "parse_results_ms", () =>
      createParseResults(supabase, requestFileIds, payload));
  }
  const error = await measureWizardStage(timings, "submit_rpc_ms", async () => {
    const { error: rpcError } = await supabase.rpc("submit_request_from_wizard", {
      p_request_id: requestId,
      p_requirement: requirementInsertPayload(payload),
      p_config_snapshot: {
        ...payload.config,
        scopeType: "full_text",
      },
      p_file_ids: requestFileIds,
      p_quote: {
        ...verifiedQuote,
        valid_until_timestamp: quoteValidUntilTimestamp(verifiedQuote.validUntil),
      },
      p_finalize: finalizeSubmission,
    });
    return rpcError;
  });
  if (error) {
    throw new Error(`Unable to submit Request transaction: ${error.message}`);
  }
}

async function persistDraftConfigurationArtifacts(
  supabase: SupabaseClient,
  requestId: string,
  userId: string,
  payload: WizardPayload,
  requestFileIds: string[],
) {
  if (!isDraftConfigurationComplete(payload)) return;
  const requirementId = randomUUID();
  const configId = randomUUID();
  await createRequirement(supabase, requestId, requirementId, payload);
  await createConfigVersion(
    supabase,
    requestId,
    requirementId,
    configId,
    userId,
    payload,
  );
  if (requestFileIds.length) {
    const { error } = await supabase.from("request_config_files").insert(
      requestFileIds.map((requestFileId) => ({
        config_version_id: configId,
        request_file_id: requestFileId,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (payload.quotePreview) {
    await createQuoteFromPreview(
      supabase,
      requestId,
      payload,
      payload.quotePreview,
      "draft",
    );
  }
}

function isDraftConfigurationComplete(payload: WizardPayload) {
  try {
    validateCommercialFields(payload);
    validateFutureDateString(payload.config.dueAt, "Due date");
    return true;
  } catch {
    return false;
  }
}

async function createParseResults(
  supabase: SupabaseClient,
  requestFileIds: string[],
  payload: WizardPayload,
) {
  const needsStoredFileLocations = payload.sourceMode === "upload"
    || isEpGrantingTranslation(payload.config);
  const requestFiles = needsStoredFileLocations
    ? await fetchRequestFileLocations(supabase, requestFileIds)
    : [];
  const requestFileById = new Map((requestFiles ?? []).map((file) => [file.id, file]));
  const selectedPatentFiles = resolvePatentFiles(payload);
  const analysisFiles = payload.analysis?.files ?? [];
  const sourceDocument = payload.analysis?.source_document;
  const rows = requestFileIds.map((fileId, index) => {
    const patentFile = selectedPatentFiles[index];
    const analysisFile = analysisFiles[index] ?? analysisFiles[0];
    const analysisStatus = payload.analysis?.status ?? analysisFile?.status;
    const hasRealPatentAnalysis = Boolean(analysisFile);
    const requestFile = requestFileById.get(fileId);
    const customerUploadUrl = requestFile?.storage_bucket && requestFile.storage_path
      ? `storage://${requestFile.storage_bucket}/${requestFile.storage_path}`
      : null;
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
              input_mode: payload.analysis?.input_mode,
              status: analysisStatus,
              analysis_profile: payload.analysis?.analysis_profile,
              warnings: payload.analysis?.warnings ?? [],
            }
          : { todo: "Replace upload parse preview with async parser worker." },
      },
      result: {
        file_id: fileId,
        parse_status: analysisStatus === "partial" ? "needs_review" : "completed",
        word_count: analysisFile?.total_words ?? patentFile?.wordCount ?? 12000,
        page_count: patentFile?.pageCount ?? 0,
        claim_count: analysisFile?.claims_count
          ?? payload.analysis?.aggregate.claims_count
          ?? patentFile?.claimCount
          ?? 0,
        technical_fields: [payload.selectedPatent?.technicalField ?? "patent"],
        structure_json: analysisFile
          ? {
              parts: analysisFile.parts,
              document_text_words: analysisFile.document_text_words,
              drawing_ocr_words: analysisFile.drawing_ocr_words,
              aggregate: payload.analysis?.aggregate,
              analysis_profile: payload.analysis?.analysis_profile,
              warnings: analysisFile.warnings,
              counting_standard: payload.analysis?.counting_standard,
              excluded_content: payload.analysis?.excluded_content,
            }
          : { sections: ["abstract", "description", "claims"] },
        ocr_required: analysisFile
          ? Object.values(analysisFile.parts).some((part) => part.method.includes("ocr"))
          : false,
        manual_review_required: analysisStatus === "partial"
          || Boolean(sourceDocument?.is_pre_grant),
        document_kind: sourceDocument?.document_kind ?? sourceDocument?.kind_code ?? null,
        source_url: sourceDocument?.retrieval_mode === "customer_upload"
          ? customerUploadUrl
          : sourceDocument?.source_url
            ?? sourceDocument?.upstream_url
            ?? patentFile?.sourceUrl
            ?? null,
        retrieval_mode: sourceDocument?.retrieval_mode
          ?? (payload.analysis?.input_mode === "upload" ? "customer_upload" : "automatic"),
        document_language: sourceDocument?.language ?? null,
        publication_date: sourceDocument?.publication_date ?? null,
        document_date: sourceDocument?.document_date ?? null,
        document_sha256: sourceDocument?.sha256 ?? analysisFile?.sha256 ?? null,
        epo_document_id: sourceDocument?.epo_document_id
          ?? sourceDocument?.normalized_number
          ?? null,
        is_pre_grant: sourceDocument?.is_pre_grant ?? false,
        is_legacy_pre_grant: sourceDocument?.is_legacy_pre_grant ?? false,
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
  if (isEpGrantingTranslation(payload.config)) {
    const { error: fileStatusError } = await supabase
      .from("request_files")
      .update({ status: "parsed", confirmed_for_translation: true })
      .in("id", requestFileIds);
    if (fileStatusError) throw new Error(fileStatusError.message);
  }
}

async function fetchRequestFileLocations(
  supabase: SupabaseClient,
  requestFileIds: string[],
) {
  if (!requestFileIds.length) return [];
  const { data, error } = await supabase
    .from("request_files")
    .select("id, storage_bucket, storage_path")
    .in("id", requestFileIds);
  if (error) throw new Error(error.message);
  return data ?? [];
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
  await supabase.from("translation_requirements").insert({
    id: requirementId,
    request_id: requestId,
    ...requirementInsertPayload(payload),
  });
}

function requirementInsertPayload(payload: WizardPayload) {
  const config = payload.config;
  return {
    source_language: config.sourceLanguage || null,
    target_language: config.targetLanguages[0] ?? null,
    target_languages: config.targetLanguages,
    scope_type: "full_text",
    scope_details: { customScope: config.customScope },
    purpose: purposeFromChannel(config.channelCode),
    service_types: config.serviceTypes,
    ep_service_type_code: config.channelCode === "ep" ? config.epServiceType || null : null,
    translation_required: config.channelCode === "ep"
      ? config.translationRequired
      : config.serviceTypes.includes("translation"),
    service_item_code: isTraditionalValidation(config.epServiceType)
      ? config.serviceItem || null
      : null,
    opt_out_country_ids: config.channelCode === "ep" ? config.optOutCountryIds : [],
    entity_type: config.entityType || null,
    filing_type_code: config.filingType || null,
    application_type_code: config.filingApplicationType || null,
    entity_type_code: config.entityType || null,
    epv_type_code: config.epvType || null,
    pct_chapter_code: config.channelCode === "pct"
      && config.serviceTypes.includes("filing")
      ? config.pctChapter || "chapter_i"
      : null,
    jurisdiction_codes: config.channelCode === "ep" ? [] : config.jurisdictionCodes,
    ep_country_ids: config.channelCode === "ep" ? config.epCountryIds : [],
    quality_level: config.qualityLevel,
    delivery_option: DEFAULT_DELIVERY_OPTION,
    due_at: config.dueAt || null,
    is_urgent: config.isUrgent,
    terminology_notes: null,
    config_snapshot: {
      ...config,
      scopeType: "full_text",
    },
  };
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

async function createQuoteFromPreview(
  supabase: SupabaseClient,
  requestId: string,
  payload: WizardPayload,
  quote: ErpQuotePreview,
  status: "draft" | "accepted",
  versionNo?: number,
) {
  const resolvedVersionNo = versionNo ?? await nextVersion(supabase, "quotes", requestId);
  const amount = quote.total;
  const pricingSnapshot = {
    source: quote.source,
    quotedAt: quote.quotedAt,
    customerName: quote.customerName,
    validUntil: quote.validUntil ?? null,
    request: quote.request ?? null,
    response: quote.response ?? quote.rows,
  };

  const { data: storedQuote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      request_id: requestId,
      version_no: resolvedVersionNo,
      status,
      currency: quote.currency,
      total_amount: amount,
      estimated_delivery_at: payload.config.dueAt || null,
      valid_until: quoteValidUntilTimestamp(quote.validUntil),
      notes: status === "draft"
        ? "Saved requester draft estimate."
        : "Generated from verified request data.",
      pricing_snapshot: pricingSnapshot,
      breakdown_json: pricingSnapshot,
    })
    .select("id")
    .single();

  if (quoteError) throw new Error(quoteError.message);

  const quoteItems = quote.rows.map((row) => ({
    quote_id: storedQuote.id,
    label: row.countryName,
    amount: row.total,
    quantity: 1,
    unit: "country",
    description: [
      `Official ${row.officialFee.toFixed(2)} + service ${row.serviceFee.toFixed(2)} + translation ${row.translationFee.toFixed(2)}`,
      row.translationFeeDetails.length
        ? row.translationFeeDetails.map((fee) =>
            `${fee.languageName} ${fee.amount.toFixed(2)}`
          ).join("; ")
        : null,
    ].filter(Boolean).join(" · "),
  }));
  const [quoteItemResult, factorResult] = await Promise.all([
    supabase.from("quote_items").insert(quoteItems),
    supabase.from("quote_factor_snapshots").insert({
      quote_id: storedQuote.id,
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

  return storedQuote.id;
}
