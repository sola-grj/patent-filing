type EpoTifgAnalysis = {
  input_mode?: string;
  status?: string;
  analysis_profile?: string;
  analysis_receipt?: string | null;
  restored_from_storage?: boolean;
  source_document?: {
    document_kind?: string | null;
    kind_code?: string | null;
    retrieval_mode?: string | null;
    is_pre_grant?: boolean;
  } | null;
  files?: Array<{
    status?: string;
    parts?: Record<string, {
      status?: string;
      word_count?: number;
    }> & {
      claims?: {
        status?: string;
        word_count?: number;
      };
    };
  }>;
  aggregate?: {
    claims_words?: number;
  };
} | null | undefined;

export function isCustomerTifgUpload(analysis: EpoTifgAnalysis) {
  const sourceDocument = analysis?.source_document;
  const documentKind = (
    sourceDocument?.document_kind
    ?? sourceDocument?.kind_code
    ?? ""
  ).toUpperCase();

  return analysis?.input_mode === "upload"
    && sourceDocument?.retrieval_mode === "customer_upload"
    && sourceDocument.is_pre_grant === true
    && (
      documentKind.includes("TEXT_INTENDED_FOR_GRANT")
      || documentKind.includes("TIFG")
    );
}

export function isVerifiedCustomerTifg(analysis: EpoTifgAnalysis) {
  if (!isCustomerTifgUpload(analysis)) return false;
  if (
    analysis?.status !== "success"
    || analysis.analysis_profile !== "claims_only"
    || (!analysis.analysis_receipt && !analysis.restored_from_storage)
    || analysis.files?.length !== 1
    || !Number.isInteger(analysis.aggregate?.claims_words ?? Number.NaN)
    || (analysis.aggregate?.claims_words ?? 0) <= 0
  ) {
    return false;
  }

  const [file] = analysis.files;
  const parts = file.parts;
  if (!parts) return false;
  return file.status === "success"
    && parts.claims?.status === "parsed"
    && Number.isInteger(parts.claims.word_count ?? Number.NaN)
    && (parts.claims.word_count ?? 0) > 0
    && !Object.values(parts).some((part) => part.status === "parse_failed");
}

export function isEpGrantingTranslation(
  config: {
    channelCode: string;
    epServiceType: string;
    translationRequired: boolean;
  },
) {
  return config.channelCode === "ep"
    && config.epServiceType === "ep_granting"
    && config.translationRequired;
}

export function requiresCustomerTifg(input: {
  channelCode: string;
  epServiceType: string;
  translationRequired: boolean;
  analysis: EpoTifgAnalysis;
}) {
  return isEpGrantingTranslation(input)
    && !isVerifiedCustomerTifg(input.analysis);
}

export function requiresPatentDocumentAnalysis(input: {
  channelCode: string;
  epServiceType: string;
  translationRequired: boolean;
}) {
  return Boolean(input);
}

export function shouldStartAutomaticPatentAnalysis(input: {
  channelCode: string;
  epServiceType: string;
  translationRequired: boolean;
}) {
  if (input.channelCode !== "ep") return true;
  if (!input.epServiceType) return false;
  return input.epServiceType !== "ep_granting" || !input.translationRequired;
}
