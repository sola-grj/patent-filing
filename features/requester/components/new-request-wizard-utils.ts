import type {
  WizardConfig,
  WizardPatentCandidate,
  WizardPatentFile,
  WizardPayload,
  WizardSourceMode,
  WizardUploadedFile,
} from "@/features/requester/wizard-types";

export const wizardSteps = [
  { title: "Basics", description: "Name the request and choose the source." },
  { title: "Source", description: "Search patents or stage upload files." },
  { title: "Patent Detail", description: "Review patent data and choose files." },
  { title: "Parse", description: "Preview parser output and document metrics." },
  { title: "Configure", description: "Set languages, scope, quality, and timing." },
  { title: "Quote", description: "Review the mock quote before submission." },
];

export const defaultWizardConfig: WizardConfig = {
  sourceLanguage: "en",
  targetLanguage: "de",
  scopeType: "full_text",
  purpose: "european_validation",
  qualityLevel: "patent_translator_review",
  deliveryOption: "standard",
  dueAt: "",
  isUrgent: false,
  customScope: "",
};

export function buildWizardPayload(input: {
  title: string;
  sourceMode: WizardSourceMode;
  patentQuery: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: File[];
  config: WizardConfig;
  lastStep: string;
}): WizardPayload {
  return {
    title: input.title,
    sourceMode: input.sourceMode,
    patentQuery: input.patentQuery,
    selectedPatent: input.selectedPatent,
    selectedPatentFileIds: input.selectedPatentFileIds,
    uploadedFiles: input.uploadedFiles.map(fileToUploadedFile),
    config: input.config,
    lastStep: input.lastStep,
  };
}

export function validateWizardStep(step: number, payload: WizardPayload) {
  if (step === 0 && !payload.title.trim()) return "Enter a request title.";
  if (step === 1 && payload.sourceMode === "patent_search" && !payload.selectedPatent) {
    return "Search and select a patent before continuing.";
  }
  if (step === 1 && payload.sourceMode === "upload" && !payload.uploadedFiles.length) {
    return "Choose at least one file before continuing.";
  }
  if (step === 2 && payload.sourceMode === "patent_search" && !payload.selectedPatentFileIds.length) {
    return "Select at least one downloadable patent file.";
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
    return payload.selectedPatent.downloadableFiles.filter((file) =>
      payload.selectedPatentFileIds.includes(file.id),
    );
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
