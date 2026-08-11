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

export type WizardPatentRepresentative = {
  name: string;
  organization: string;
  address: string;
  country: string;
};

export type WizardPatentPriority = {
  number: string;
  date: string;
  country: string;
  kind: string;
};

export type WizardPatentDesignatedStates = {
  regions: string[];
  countries: string[];
  protectionTypes: string[];
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
  agents?: WizardPatentRepresentative[];
  priorities?: WizardPatentPriority[];
  description: string;
  filingDate: string;
  publicationDate: string;
  language?: string;
  firstPriorityDate?: string;
  internationalFilingDate?: string;
  grantPublicationDate?: string;
  rule713CommunicationDate?: string;
  filingDeadline30Months?: string;
  filingDeadline31Months?: string;
  totalPages?: number;
  legalStatus: string;
  technicalField: string;
  downloadableFiles: WizardPatentFile[];
  abstractWordCount?: number;
  descriptionWordCount?: number;
  claimsWordCount?: number;
  claimsCount?: number;
  drawingCount?: number;
  source?: string;
  publicationLanguage?: string;
  filingLanguage?: string;
  ipcCodes?: string[];
  cpcCodes?: string[];
  designatedStates?: WizardPatentDesignatedStates;
  relatedPatentDocuments?: string[];
  dataOrigin?: "official" | "cache_fallback";
  cache?: {
    isCached: boolean;
    reason?: "official_source_no_result";
    lastSuccessfulFetchAt?: string;
  };
  lookupReceipt?: string;
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
  pctChapter?: "chapter_i" | "chapter_ii" | "";
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
  requestFileId?: string;
  name: string;
  size: number;
  type: string;
};

export type WizardPatentAnalysisPart = {
  word_count: number;
  status: "found" | "missing" | "unclassified" | "error";
  method: string;
  confidence: string;
};

export type WizardPatentAnalysisFile = {
  filename: string;
  file_type: "pdf" | "doc" | "docx" | "wipo_zip" | "epo_zip";
  sha256: string;
  status: "success" | "partial" | "failed";
  parts: {
    abstract: WizardPatentAnalysisPart;
    abstract_drawing: WizardPatentAnalysisPart;
    description: WizardPatentAnalysisPart;
    description_drawings: WizardPatentAnalysisPart;
    claims: WizardPatentAnalysisPart;
    unclassified: WizardPatentAnalysisPart;
  };
  document_text_words: number;
  drawing_ocr_words: number;
  total_words: number;
  warnings: string[];
};

export type WizardPatentAnalysisResult = {
  input_mode: "upload" | "patent_number";
  status: "success" | "partial" | "failed";
  patent_number?: string | null;
  analysis_receipt?: string | null;
  artifact?: {
    artifact_id: string;
    filename: string;
    mime_type: string;
    byte_size: number;
    sha256: string;
    expires_at: string;
  } | null;
  source_document?: {
    strategy: "external_url" | "generated_cache";
    source: "epo" | "wipo";
    normalized_number: string;
    kind_code?: string | null;
    filename: string;
    mime_type: string;
    upstream_url?: string | null;
  } | null;
  counting_standard: string;
  excluded_content: string[];
  files: WizardPatentAnalysisFile[];
  aggregate: {
    abstract_words: number;
    abstract_drawing_words: number;
    description_words: number;
    description_drawings_words: number;
    claims_words: number;
    unclassified_words: number;
    total_words: number;
  };
  warnings: string[];
};

export type WizardPatentAnalysisStatus = "idle" | "pending" | "complete" | "error";

export type WizardPayload = {
  requestId?: string;
  sourceMode: WizardSourceMode;
  patentQuery?: string;
  selectedPatent?: WizardPatentCandidate;
  selectedPatentFileIds: string[];
  uploadedFiles: WizardUploadedFile[];
  analysis?: WizardPatentAnalysisResult;
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
