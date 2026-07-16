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
  drawingCount: number;
};

export type WizardPatentCandidate = {
  id: string;
  patentNumber: string;
  title: string;
  jurisdiction: string;
  applicationNo: string;
  publicationNo: string;
  applicants: string[];
  inventors: string[];
  description: string;
  filingDate: string;
  publicationDate: string;
  language?: string;
  firstPriorityDate?: string;
  internationalFilingDate?: string;
  filingDeadline30Months?: string;
  filingDeadline31Months?: string;
  totalPages?: number;
  legalStatus: string;
  technicalField: string;
  downloadableFiles: WizardPatentFile[];
  abstractWordCount?: number;
  descriptionWordCount?: number;
  claimsWordCount?: number;
  source?: string;
  ipcCodes?: string[];
  cpcCodes?: string[];
  sourceSnapshot?: Record<string, unknown>;
};

export type WizardConfig = {
  channelCode: string;
  sourceLanguage: string;
  jurisdictionCodes: string[];
  scopeType: string;
  purpose: string;
  serviceTypes: string[];
  filingType?: string;
  filingApplicationType?: string;
  entityType?: string;
  epvType?: string;
  qualityLevel: string;
  deliveryOption: string;
  dueAt?: string;
  isUrgent: boolean;
  customScope?: string;
};

export type DictionaryOption = {
  value: string;
  label: string;
  isoCountryCode?: string;
  countryGroup?: string;
};

export type WizardDictionaries = {
  channels: DictionaryOption[];
  serviceTypes: DictionaryOption[];
  filingTypes: DictionaryOption[];
  applicationTypes: DictionaryOption[];
  entityTypes: DictionaryOption[];
  epvTypes: DictionaryOption[];
  jurisdictions: DictionaryOption[];
};

export type WizardUploadedFile = {
  name: string;
  size: number;
  type: string;
};

export type WizardPayload = {
  requestId?: string;
  sourceMode: WizardSourceMode;
  patentQuery?: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: WizardUploadedFile[];
  config: WizardConfig;
  lastStep: string;
};

export type WizardDraftSession = {
  requestId: string;
  requestNo: string;
  payload: Partial<WizardPayload>;
};

export type WizardPersistResult = {
  requestId: string;
  requestNo: string;
};
