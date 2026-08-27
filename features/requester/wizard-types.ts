import type { ErpQuoteCurrencyCode, ErpQuotePreview } from "@/lib/eci-erp/types";

export type WizardSourceMode = "patent_search" | "upload";

export type EpServiceTypeCode =
  | "ep_granting"
  | "traditional_validation"
  | "unitary_patent"
  | "traditional_validation_unitary_patent";

export type TraditionalServiceItemCode =
  | "traditional_validation"
  | "traditional_validation_opt_out"
  | "opt_out_only"
  | "opt_in_only";

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
  hasB1Publication?: boolean;
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
  proceduralLanguage?: string;
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
  targetLanguages: string[];
  translationRequired: boolean;
  epServiceType: EpServiceTypeCode | "";
  epCountryIds: number[];
  optOutCountryIds: number[];
  epCountriesConfirmed: boolean;
  optOutCountriesConfirmed: boolean;
  serviceItem: TraditionalServiceItemCode | "";
  jurisdictionCodes: string[];
  scopeType: string;
  purpose: string;
  serviceTypes: string[];
  filingType?: string;
  filingApplicationType?: string;
  entityType?: string;
  epvType?: string;
  optType?: "in" | "out" | "";
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

export type EpCountryOption = {
  id: number;
  name: string;
  cname: string;
  abbr: string;
};

export type WizardDictionaries = {
  channels: DictionaryOption[];
  serviceTypes: DictionaryOption[];
  filingTypes: DictionaryOption[];
  applicationTypes: DictionaryOption[];
  entityTypes: DictionaryOption[];
  epvTypes: DictionaryOption[];
  epCountries: EpCountryOption[];
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
  status: "parsed" | "not_present" | "parse_failed";
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
  claims_count: number;
  warnings: string[];
};

export type WizardPatentAnalysisResult = {
  input_mode: "upload" | "patent_number";
  status: "success" | "partial" | "failed";
  analysis_profile?: "full_document" | "claims_only";
  patent_number?: string | null;
  analysis_receipt?: string | null;
  restored_from_storage?: boolean;
  analysis_cache?: {
    scope: "global" | "organization";
    outcome: "hit" | "partial_hit" | "miss" | "waited_hit" | "bypass";
    pipeline_fingerprint: string;
    entries: Array<{
      filename: string;
      document_sha256: string;
      analysis_input_sha256: string;
      pipeline_fingerprint: string;
      scope: "global" | "organization";
      status: "hit" | "waited_hit" | "miss" | "bypass";
    }>;
  } | null;
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
    document_kind?: string | null;
    filename: string;
    mime_type: string;
    upstream_url?: string | null;
    source_url?: string | null;
    retrieval_mode?: "automatic" | "customer_upload";
    language?: string | null;
    publication_date?: string | null;
    document_date?: string | null;
    sha256?: string | null;
    byte_size?: number | null;
    epo_document_id?: string | null;
    application_number?: string | null;
    register_application_number?: string | null;
    is_pre_grant?: boolean;
    is_legacy_pre_grant?: boolean;
    strategy_version?: string;
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
    claims_count: number;
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
  quoteCurrency?: ErpQuoteCurrencyCode;
  quotePreview?: ErpQuotePreview;
  config: WizardConfig;
  lastStep: string;
};

export type WizardDraftPayloadV2 = {
  schemaVersion: 2;
  sourceMode: WizardSourceMode;
  patentQuery?: string;
  selectedPatentFileIds: string[];
  uploadedFiles: WizardUploadedFile[];
  quoteCurrency?: ErpQuoteCurrencyCode;
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
