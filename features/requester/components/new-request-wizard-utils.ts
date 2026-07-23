import type {
  WizardConfig,
  WizardPatentCandidate,
  WizardPatentAnalysisResult,
  WizardPatentFile,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { validateFutureDateString } from "@/lib/validators/requester";

export const wizardSteps = [
  { title: "Source", description: "Search by patent number or upload source files." },
  { title: "Configure", description: "Set languages, quality, and timing." },
  { title: "Quote", description: "Review the mock quote before submission." },
];

export const defaultWizardConfig: WizardConfig = {
  channelCode: "ep",
  sourceLanguage: "",
  jurisdictionCodes: [],
  scopeType: "full_text",
  purpose: "european_validation",
  serviceTypes: [],
  filingType: "",
  filingApplicationType: "",
  entityType: "",
  epvType: "",
  qualityLevel: "patent_translator",
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
  | "sourceLanguage"
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
    config: {
      ...input.config,
      scopeType: "full_text",
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
  return null;
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
  const serviceTypes = Array.isArray(config?.serviceTypes)
    ? config.serviceTypes.filter(Boolean)
    : [];
  const isTranslationOnlyService = serviceTypes.length === 1
    && serviceTypes[0] === "translation";

  return {
    ...merged,
    channelCode: config?.channelCode === "upload_files"
      ? "ep"
      : config?.channelCode || legacyChannel,
    serviceTypes,
    dueAt: isTranslationOnlyService ? merged.dueAt : "",
    jurisdictionCodes: Array.isArray(config?.jurisdictionCodes)
      ? config.jurisdictionCodes.filter(Boolean)
      : [],
    scopeType: "full_text",
    qualityLevel: ["machine_pretranslation", "patent_translator"].includes(
      config?.qualityLevel ?? "",
    )
      ? config?.qualityLevel ?? "patent_translator"
      : "patent_translator",
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

  if (!config.channelCode) {
    errors.channelCode = "Select a channel before continuing.";
  }

  if (!config.serviceTypes.length) {
    errors.serviceTypes = "Select at least one service type before continuing.";
  }

  const hasTranslationGrant = config.serviceTypes.includes("translation")
    && config.serviceTypes.includes("european_patent_grant_registration");
  if (config.channelCode !== "ep" && (hasEpvService || hasTranslationGrant)) {
    errors.serviceTypes = "EPV and Translation + Grant are only available for EPO.";
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

  if (!config.sourceLanguage) {
    errors.sourceLanguage = "Select a patent language before continuing.";
  }

  if (!config.jurisdictionCodes.length) {
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
