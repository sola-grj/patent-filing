import type {
  WizardConfig,
  WizardPatentCandidate,
  WizardPatentAnalysisResult,
  WizardPatentFile,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { HUMAN_TRANSLATION_QUALITY_LEVEL } from "@/features/requester/options";
import {
  isTraditionalValidation,
  isAllowedServiceTypeConfig,
  normalizeServiceTypeConfig,
  requiresEpCountries,
} from "@/features/requester/request-paths";
import { validateFutureDateString } from "@/lib/validators/requester";
import type { ErpQuoteCurrencyCode } from "@/lib/eci-erp/types";

export const wizardSteps = [
  { title: "Source", description: "Search by patent number or upload source files." },
  { title: "Configure", description: "Set languages, scope, and timing." },
  { title: "Quote", description: "Review the live ERP quote before submission." },
];

export const defaultWizardConfig: WizardConfig = {
  channelCode: "ep",
  sourceLanguage: "",
  epCountryIds: [],
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
  | "optType"
  | "pctChapter"
  | "sourceLanguage"
  | "epCountryIds"
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
      ...input.config,
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
    const fieldErrors = validateWizardConfigFields(payload.config);
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
  const analysis = payload.analysis;
  if (!analysis || !["success", "partial"].includes(analysis.status)) return false;
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
  );
  const serviceTypes = serviceConfig.serviceTypes;
  const isTranslationOnlyService = serviceTypes.length === 1
    && serviceTypes[0] === "translation";
  const hasPctFilingService = channelCode === "pct"
    && serviceTypes.includes("filing");
  const optType = isTraditionalValidation(serviceConfig.epvType)
    && ["in", "out"].includes(merged.optType ?? "")
    ? merged.optType as "in" | "out"
    : "";

  return {
    ...merged,
    channelCode,
    serviceTypes,
    dueAt: isTranslationOnlyService ? merged.dueAt : "",
    epvType: serviceConfig.epvType,
    optType,
    pctChapter: hasPctFilingService && merged.pctChapter === "chapter_ii"
      ? "chapter_ii"
      : hasPctFilingService
        ? "chapter_i"
        : "",
    jurisdictionCodes: Array.isArray(config?.jurisdictionCodes)
      ? config.jurisdictionCodes.filter(Boolean)
      : [],
    epCountryIds: requiresEpCountries(serviceTypes)
      ? normalizeEpCountryIds(config?.epCountryIds)
      : [],
    scopeType: "full_text",
    qualityLevel: HUMAN_TRANSLATION_QUALITY_LEVEL,
  };
}

export function validateWizardConfigFields(
  config: WizardConfig,
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
    )
  ) {
    errors.serviceTypes = "Select a service type available for the chosen path.";
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

  if (isTraditionalValidation(config.epvType) && !config.optType) {
    errors.optType = "Select an Opt Type before continuing.";
  }

  if (
    hasPctFilingService
    && !["chapter_i", "chapter_ii"].includes(config.pctChapter ?? "")
  ) {
    errors.pctChapter = "Choose whether a PCT Chapter II Demand was filed.";
  }

  if (!config.sourceLanguage) {
    errors.sourceLanguage = "Select a source language before continuing.";
  }

  if (
    config.channelCode === "ep"
    && requiresEpCountries(config.serviceTypes)
    && !config.epCountryIds.length
  ) {
    errors.epCountryIds = "Select at least one EP country before continuing.";
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
