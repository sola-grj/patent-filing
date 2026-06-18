export type WizardSourceMode = "patent_search" | "upload";

export type WizardPatentFile = {
  id: string;
  label: string;
  fileType: string;
  language: string;
  sourceUrl: string;
  pageCount: number;
  wordCount: number;
  claimCount: number;
};

export type WizardPatentCandidate = {
  id: string;
  patentNumber: string;
  title: string;
  jurisdiction: string;
  applicationNo: string;
  publicationNo: string;
  applicants: string[];
  abstract: string;
  filingDate: string;
  publicationDate: string;
  legalStatus: string;
  technicalField: string;
  downloadableFiles: WizardPatentFile[];
};

export type WizardConfig = {
  sourceLanguage: string;
  targetLanguage: string;
  scopeType: string;
  purpose: string;
  qualityLevel: string;
  deliveryOption: string;
  dueAt?: string;
  isUrgent: boolean;
  customScope?: string;
};

export type WizardUploadedFile = {
  name: string;
  size: number;
  type: string;
};

export type WizardPayload = {
  title: string;
  sourceMode: WizardSourceMode;
  patentQuery?: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: WizardUploadedFile[];
  config: WizardConfig;
  lastStep: string;
};

export type WizardPersistResult = {
  requestId: string;
};
