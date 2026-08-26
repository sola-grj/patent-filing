import type {
  EpServiceTypeCode,
  TraditionalServiceItemCode,
  WizardConfig,
  WizardPatentCandidate,
  WizardPatentAnalysisResult,
  WizardPatentFile,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import {
  epoSourceLanguageOptions,
  HUMAN_TRANSLATION_QUALITY_LEVEL,
  mockUnitaryTargetLanguageOptions,
} from "@/features/requester/options";
import {
  isTraditionalValidation,
  isAllowedServiceTypeConfig,
  normalizeServiceTypeConfig,
  requiresEpCountries,
  usesEpoTargetLanguages,
} from "@/features/requester/request-paths";
import { validateFutureDateString } from "@/lib/validators/requester";
import type { ErpQuoteCurrencyCode } from "@/lib/eci-erp/types";
import { getEpoServiceAvailability } from "@/features/requester/deadlines";
import {
  isEpGrantingTranslation,
  isVerifiedCustomerTifg,
  requiresCustomerTifg,
  requiresPatentDocumentAnalysis,
} from "@/features/requester/epo-tifg-upload";

export const wizardSteps = [
  { title: "Source", description: "Search by patent number or upload source files." },
  { title: "Configure", description: "Set languages, scope, and timing." },
  { title: "Quote", description: "Review the live quote before submission." },
];

export const defaultWizardConfig: WizardConfig = {
  channelCode: "ep",
  sourceLanguage: "",
  targetLanguages: [],
  translationRequired: false,
  epServiceType: "",
  epCountryIds: [],
  optOutCountryIds: [],
  epCountriesConfirmed: false,
  optOutCountriesConfirmed: false,
  serviceItem: "",
  jurisdictionCodes: [],
  scopeType: "full_text",
  purpose: "european_validation",
  serviceTypes: [],
  filingType: "",
  filingApplicationType: "",
  entityType: "",
  epvType: "",
  optType: "",
  pctChapter: "",
  qualityLevel: HUMAN_TRANSLATION_QUALITY_LEVEL,
  deliveryOption: "standard",
  dueAt: "",
  isUrgent: false,
  customScope: "",
};

export type WizardConfigFieldErrors = Partial<Record<
  | "channelCode"
  | "serviceTypes"
  | "filingType"
  | "filingApplicationType"
  | "entityType"
  | "epvType"
  | "serviceItem"
  | "targetLanguages"
  | "pctChapter"
  | "sourceLanguage"
  | "epCountryIds"
  | "optOutCountryIds"
  | "tifgDocument"
  | "jurisdictionCodes"
  | "dueAt",
  string
>>;

export function buildWizardPayload(input: {
  requestId?: string;
  sourceMode: WizardSourceMode;
  patentQuery: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: File[];
  uploadedFileSnapshots?: WizardUploadedFile[];
  analysis?: WizardPatentAnalysisResult;
  quoteCurrency: ErpQuoteCurrencyCode;
  config: WizardConfig;
  lastStep: string;
}): WizardPayload {
  const normalizedConfig = normalizeWizardConfig(input.config);
  return {
    requestId: input.requestId,
    sourceMode: input.sourceMode,
    patentQuery: input.patentQuery,
    selectedPatent: input.selectedPatent,
    selectedPatentFileIds: input.selectedPatentFileIds,
    uploadedFiles: input.uploadedFiles.length
      ? input.uploadedFiles.map(fileToUploadedFile)
      : input.uploadedFileSnapshots ?? [],
    analysis: input.analysis,
    quoteCurrency: input.quoteCurrency,
    config: {
      ...normalizedConfig,
      scopeType: "full_text",
      qualityLevel: HUMAN_TRANSLATION_QUALITY_LEVEL,
    },
    lastStep: input.lastStep,
  };
}

export function validateWizardStep(step: number, payload: WizardPayload) {
  if (step === 0 && payload.sourceMode === "patent_search" && !payload.selectedPatent) {
    return "Search and select a patent before continuing.";
  }
  if (step === 0 && payload.sourceMode === "upload" && !payload.uploadedFiles.length) {
    return "Upload at least one file before continuing.";
  }
  if (step === 1) {
    const fieldErrors = validateWizardConfigFields(
      payload.config,
      payload.selectedPatent,
      payload.analysis,
    );
    const firstError = Object.values(fieldErrors)[0];
    if (firstError) {
      return firstError;
    }
  }
  return null;
}

export function validateWizardPayload(payload: WizardPayload) {
  for (let index = 0; index < wizardSteps.length - 1; index += 1) {
    const error = validateWizardStep(index, payload);
    if (error) return error;
  }
  if (!hasUsablePatentAnalysis(payload)) {
    if (payload.analysis?.status === "failed") {
      return payload.sourceMode === "upload"
        ? "Uploaded file processing failed. Review the files before submitting."
        : "Patent data processing failed. Retry before submitting.";
    }
    return payload.sourceMode === "upload"
      ? "Uploaded files are still being processed. Wait for usable word counts before submitting."
      : "Patent data is still being processed. Wait for usable word counts before submitting.";
  }
  return null;
}

export function hasUsablePatentAnalysis(payload: WizardPayload) {
  if (
    payload.sourceMode === "patent_search"
    && isEpGrantingTranslation(payload.config)
  ) return isVerifiedCustomerTifg(payload.analysis);
  if (
    payload.sourceMode === "patent_search"
    && !requiresPatentDocumentAnalysis(payload.config)
  ) return true;
  const analysis = payload.analysis;
  if (!analysis || !["success", "partial"].includes(analysis.status)) return false;
  if (!analysis.files.length || analysis.files.some((file) =>
    file.status === "failed"
    || Object.values(file.parts).some((part) => part.status === "parse_failed")
  )) return false;
  if (payload.config.scopeType === "no_translation") return true;
  if (payload.config.scopeType === "claims_only") {
    return analysis.aggregate.claims_words > 0;
  }
  return analysis.aggregate.total_words > 0;
}

export function parsePreviewFiles(payload: WizardPayload): WizardPatentFile[] {
  if (payload.sourceMode === "patent_search" && payload.selectedPatent) {
    const selectedPatentFiles = payload.selectedPatent.downloadableFiles.filter((file) =>
      payload.selectedPatentFileIds.includes(file.id),
    );
    return selectedPatentFiles.length > 0
      ? selectedPatentFiles
      : payload.selectedPatent.downloadableFiles;
  }

  return payload.uploadedFiles.map((file, index) => ({
    id: `${file.name}-${index}`,
    label: file.name,
    fileType: file.name.split(".").pop() ?? "file",
    language: "en",
    sourceUrl: "",
    pageCount: 24 + index * 3,
    wordCount: 12000 + index * 1500,
    claimCount: 18,
    drawingCount: 6 + index,
  }));
}

export function toWizardFormData(payload: WizardPayload, files: File[]) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  files.forEach((file) => formData.append("files", file));
  return formData;
}

export function fileToUploadedFile(file: File): WizardUploadedFile {
  return { name: file.name, size: file.size, type: file.type };
}

export function toggleId(ids: string[], id: string, checked: boolean) {
  if (checked) return ids.includes(id) ? ids : [...ids, id];
  return ids.filter((item) => item !== id);
}

export function onConfigValueChange<K extends keyof WizardConfig>(
  config: WizardConfig,
  onChange: (config: WizardConfig) => void,
  key: K,
) {
  return (value: string) => onChange({ ...config, [key]: value });
}

export function updateWizardChannel(
  config: WizardConfig,
  channelCode: string,
): WizardConfig {
  return {
    ...config,
    channelCode,
    serviceTypes: [],
    filingType: "",
    filingApplicationType: "",
    epvType: "",
    epServiceType: "",
    translationRequired: false,
    targetLanguages: [],
    serviceItem: "",
    optOutCountryIds: [],
    epCountriesConfirmed: false,
    optOutCountriesConfirmed: false,
    optType: "",
    pctChapter: channelCode === "pct" ? "chapter_i" : "",
    dueAt: "",
    epCountryIds: [],
    jurisdictionCodes: [],
  };
}

export function normalizeWizardConfig(
  config?: Partial<WizardConfig> & {
    targetLanguage?: string;
    targetLanguages?: string[];
  },
): WizardConfig {
  const merged = {
    ...defaultWizardConfig,
    ...config,
  };

  const legacyChannel = config?.purpose === "pct_national_phase"
    ? "pct"
    : config?.purpose === "paris_convention"
      ? "paris_convention"
      : "ep";
  const channelCode = config?.channelCode === "upload_files"
    ? "ep"
    : config?.channelCode || legacyChannel;
  const configuredServiceTypes = Array.isArray(config?.serviceTypes)
    ? config.serviceTypes.filter(Boolean)
    : [];
  const serviceConfig = normalizeServiceTypeConfig(
    channelCode,
    configuredServiceTypes,
    merged.epvType,
    merged.epServiceType,
  );
  const translationRequired = channelCode === "ep"
    ? Boolean(config?.translationRequired ?? configuredServiceTypes.includes("translation"))
    : configuredServiceTypes.includes("translation");
  const serviceTypes = channelCode === "ep" && translationRequired
    ? [...serviceConfig.serviceTypes, "translation"]
    : serviceConfig.serviceTypes;
  const isTranslationOnlyService = serviceTypes.length === 1
    && serviceTypes[0] === "translation";
  const hasPctFilingService = channelCode === "pct"
    && serviceTypes.includes("filing");
  const hasTraditionalItems = isTraditionalValidation(serviceConfig.epServiceType);
  const serviceItem = normalizeServiceItem(
    hasTraditionalItems,
    merged.serviceItem,
    merged.optType,
  );
  const epoSourceLanguages = new Set(epoSourceLanguageOptions.map((option) => option.value));
  const sourceLanguage = channelCode === "ep"
    && !epoSourceLanguages.has(merged.sourceLanguage)
    ? ""
    : merged.sourceLanguage;
  const targetLanguages = channelCode === "ep"
    ? normalizeEpoTargetLanguages(
        serviceConfig.epServiceType,
        translationRequired,
        sourceLanguage,
        config?.targetLanguages ?? (config?.targetLanguage ? [config.targetLanguage] : []),
      )
    : normalizeTextValues(
        config?.targetLanguages ?? (config?.targetLanguage ? [config.targetLanguage] : []),
      );
  const epCountryIds = requiresEpCountries(serviceConfig.epServiceType)
    ? normalizeEpCountryIds(config?.epCountryIds)
    : [];
  const optOutCountryIds = serviceItem === "traditional_validation_opt_out"
    ? normalizeEpCountryIds(config?.optOutCountryIds)
        .filter((id) => epCountryIds.includes(id))
    : [];

  return {
    ...merged,
    channelCode,
    serviceTypes,
    sourceLanguage,
    targetLanguages,
    translationRequired,
    dueAt: isTranslationOnlyService ? merged.dueAt : "",
    epvType: serviceConfig.epvType,
    epServiceType: serviceConfig.epServiceType as EpServiceTypeCode | "",
    serviceItem,
    optOutCountryIds,
    epCountriesConfirmed: Boolean(config?.epCountriesConfirmed && epCountryIds.length),
    optOutCountriesConfirmed: Boolean(
      config?.optOutCountriesConfirmed
      && serviceItem === "traditional_validation_opt_out"
      && optOutCountryIds.length,
    ),
    optType: "",
    pctChapter: hasPctFilingService && merged.pctChapter === "chapter_ii"
      ? "chapter_ii"
      : hasPctFilingService
        ? "chapter_i"
        : "",
    jurisdictionCodes: Array.isArray(config?.jurisdictionCodes)
      ? config.jurisdictionCodes.filter(Boolean)
      : [],
    epCountryIds,
    scopeType: "full_text",
    qualityLevel: HUMAN_TRANSLATION_QUALITY_LEVEL,
  };
}

export function validateWizardConfigFields(
  config: WizardConfig,
  patent?: WizardPatentCandidate,
  analysis?: WizardPatentAnalysisResult,
): WizardConfigFieldErrors {
  const errors: WizardConfigFieldErrors = {};
  const hasTranslationService = config.serviceTypes.includes("translation");
  const isTranslationOnlyService = config.serviceTypes.length === 1
    && hasTranslationService;
  const hasFilingService = config.serviceTypes.includes("filing");
  const hasEpvService = config.serviceTypes.includes("epv");
  const hasPctFilingService = config.channelCode === "pct" && hasFilingService;

  if (!config.channelCode) {
    errors.channelCode = "Select a channel before continuing.";
  }

  if (!config.serviceTypes.length) {
    errors.serviceTypes = "Select at least one service type before continuing.";
  }

  if (
    config.serviceTypes.length
    && !isAllowedServiceTypeConfig(
      config.channelCode,
      config.serviceTypes,
      config.epvType,
      config.epServiceType,
    )
  ) {
    errors.serviceTypes = "Select a service type available for the chosen path.";
  }

  if (config.channelCode === "ep" && config.epServiceType) {
    const availability = getEpoServiceAvailability(
      config.epServiceType,
      patent,
      analysis,
    );
    if (!availability.available) {
      errors.serviceTypes = availability.reason
        ?? "The selected EPO service is not currently available.";
    }
  }

  if (requiresCustomerTifg({
    channelCode: config.channelCode,
    epServiceType: config.epServiceType,
    translationRequired: config.translationRequired,
    analysis,
  })) {
    errors.tifgDocument = "Upload and verify the TIFG clean-copy PDF before continuing.";
  }

  if (hasFilingService) {
    if (!config.filingType) {
      errors.filingType = "Select a filing type before continuing.";
    }

    if (!config.filingApplicationType) {
      errors.filingApplicationType = "Select an application type before continuing.";
    }

    if (!config.entityType) {
      errors.entityType = "Select an entity type before continuing.";
    }
  }

  if (hasEpvService && !config.epvType) {
    errors.epvType = "Select an EPV type before continuing.";
  }

  if (isTraditionalValidation(config.epServiceType) && !config.serviceItem) {
    errors.serviceItem = "Select a Service Item before continuing.";
  }

  if (
    hasPctFilingService
    && !["chapter_i", "chapter_ii"].includes(config.pctChapter ?? "")
  ) {
    errors.pctChapter = "Choose whether a PCT Chapter II Demand was filed.";
  }

  if (requiresSourceLanguage(config) && !config.sourceLanguage) {
    errors.sourceLanguage = "Select a source language before continuing.";
  }

  if (
    config.channelCode === "ep"
    && config.translationRequired
    && usesEpoTargetLanguages(config.epServiceType)
    && !config.targetLanguages.length
  ) {
    errors.targetLanguages = "Select a target language before continuing.";
  }

  if (
    config.channelCode === "ep"
    && requiresEpCountries(config.epServiceType)
    && !config.epCountryIds.length
  ) {
    errors.epCountryIds = "Select at least one EP country before continuing.";
  }

  if (
    config.channelCode === "ep"
    && requiresEpCountries(config.epServiceType)
    && config.epCountryIds.length
    && !config.epCountriesConfirmed
  ) {
    errors.epCountryIds = "Confirm the selected EP countries before continuing.";
  }

  if (
    config.serviceItem === "traditional_validation_opt_out"
    && (!config.optOutCountryIds.length || !config.optOutCountriesConfirmed)
  ) {
    errors.optOutCountryIds = "Select and confirm at least one Opt Out country.";
  }

  if (config.channelCode !== "ep" && !config.jurisdictionCodes.length) {
    errors.jurisdictionCodes = "Select at least one jurisdiction before continuing.";
  }

  if (isTranslationOnlyService && config.dueAt) {
    try {
      validateFutureDateString(config.dueAt, "Due date");
    } catch (error) {
      errors.dueAt = error instanceof Error ? error.message : "Due date is invalid.";
    }
  }

  return errors;
}

export function normalizeEpCountryIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter((item) => Number.isInteger(item) && item > 0))];
}

export function requiresSourceLanguage(config: WizardConfig) {
  if (config.channelCode !== "ep") return true;
  return Boolean(config.epServiceType);
}

export function normalizeEpoTargetLanguages(
  epServiceType: string,
  translationRequired: boolean,
  sourceLanguage: string,
  targetLanguages: unknown,
) {
  if (!translationRequired || !usesEpoTargetLanguages(epServiceType)) return [];
  if (epServiceType === "ep_granting") {
    return epoSourceLanguageOptions
      .map((option) => option.value)
      .filter((language) => language !== sourceLanguage);
  }
  if (["fr", "de"].includes(sourceLanguage)) return ["en"];
  if (sourceLanguage !== "en") return [];
  const allowed = new Set<string>(mockUnitaryTargetLanguageOptions
    .map((option) => option.value)
    .filter((value) => value !== "en"));
  return normalizeTextValues(targetLanguages)
    .filter((value) => allowed.has(value))
    .slice(0, 1);
}

function normalizeServiceItem(
  enabled: boolean,
  value?: string,
  legacyOptType?: string,
): TraditionalServiceItemCode | "" {
  if (!enabled) return "";
  if ([
    "traditional_validation",
    "traditional_validation_opt_out",
    "opt_out_only",
    "opt_in_only",
  ].includes(value ?? "")) {
    return value as TraditionalServiceItemCode;
  }
  if (legacyOptType === "out") return "opt_out_only";
  if (legacyOptType === "in") return "opt_in_only";
  return "traditional_validation";
}

function normalizeTextValues(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
}
