import type {
  WizardConfig,
  WizardPatentCandidate,
  WizardPatentFile,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";
import { validateFutureDateString } from "@/lib/validators/requester";

export const wizardSteps = [
  { title: "Source", description: "Search by patent number or upload source files." },
  { title: "Configure", description: "Set languages, scope, quality, and timing." },
  { title: "Quote", description: "Review the mock quote before submission." },
];

export const defaultWizardConfig: WizardConfig = {
  sourceLanguage: "en",
  targetLanguage: "de",
  scopeType: "full_text",
  purpose: "paris_convention",
  qualityLevel: "patent_translator_review",
  deliveryOption: "standard",
  dueAt: "",
  isUrgent: false,
  customScope: "",
};

export function buildWizardPayload(input: {
  requestId?: string;
  sourceMode: WizardSourceMode;
  patentQuery: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: File[];
  uploadedFileSnapshots?: WizardUploadedFile[];
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
    config: input.config,
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
    try {
      validateFutureDateString(payload.config.dueAt, "Due date");
    } catch (error) {
      return error instanceof Error ? error.message : "Due date is invalid.";
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
