import type {
  WizardPatentCandidate,
  WizardPatentFile,
  WizardPatentPriority,
  WizardPatentRepresentative,
} from "@/features/requester/wizard-types";

const defaultPatentServiceBaseUrl = "http://127.0.0.1:9999";

export type PatentLookupResponse = {
  source?: string;
  normalized_number?: string;
  display_number?: string;
  title?: string;
  abstract?: string;
  ipc?: string[];
  cpc?: string[];
  applicants?: string[];
  inventors?: string[];
  representatives?: PatentRepresentative[];
  agents?: PatentRepresentative[];
  priority_data?: PatentPriority[];
  publication_language?: string | null;
  filing_language?: string | null;
  designated_states?: {
    regions?: string[];
    countries?: string[];
    protection_types?: string[];
  };
  related_patent_documents?: string[];
  application_date?: string | null;
  application_no?: string | null;
  publication_date?: string | null;
  publication_no?: string | null;
  language?: string | null;
  first_priority_date?: string | null;
  international_filing_date?: string | null;
  filing_deadline_30_months?: string | null;
  filing_deadline_31_months?: string | null;
  total_pages?: number | null;
  abstract_words?: number | null;
  description_words?: number | null;
  claims_count?: number | null;
  claims_words?: number | null;
  drawings?: {
    has_drawings?: boolean;
    drawing_page_count?: number | null;
    drawing_labels?: string[];
  };
  original_file_download_url?: string | null;
  original_file?: {
    content_type?: string;
    filename?: string;
    download_url?: string;
  };
  basic_info?: {
    title?: string;
    abstract?: string;
    publication_date?: string;
    application_number?: string;
    applicants?: string[];
    inventors?: string[];
    representatives?: PatentRepresentative[];
    ipc?: string[];
    cpc?: string[];
  };
  raw_source_refs?: PatentRawSourceRefs;
};

type PatentRepresentative = {
  name?: string;
  organization?: string;
  address?: string;
  country?: string;
};

type PatentPriority = {
  number?: string;
  date?: string;
  country?: string;
  kind?: string;
};

type PatentRawSourceRefs = {
  ops_images?: { page_count?: number | null };
  generated_pdf?: { page_count?: number | null };
  document_pages?: string[];
};

type PatentLookupError = {
  error?: { code?: string; message?: string };
};

export async function lookupPatent(
  patentNumber: string,
): Promise<WizardPatentCandidate> {
  let response: Response;

  try {
    response = await fetch(resolveLookupUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patent_number: patentNumber,
        include_original_file: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error(
      "The patent lookup service is unavailable. Please try again later.",
    );
  }
  const body = await readJson(response);

  if (!response.ok) {
    throwLookupError(response.status, body, patentNumber);
  }

  return mapPatentLookupResponse(body as PatentLookupResponse, patentNumber);
}

function resolveLookupUrl() {
  const baseUrl = (
    process.env.PATENT_SERVICE_BASE_URL ?? defaultPatentServiceBaseUrl
  ).replace(/\/$/, "");
  return `${baseUrl}/api/patents/lookup`;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The patent lookup service returned an invalid response.");
  }
}

function throwLookupError(
  status: number,
  body: unknown,
  patentNumber: string,
): never {
  const lookupError = body as PatentLookupError;
  const code = lookupError.error?.code;
  const message = lookupError.error?.message;

  if (status === 404 || code === "source_no_result") {
    throw new Error(
      `No patent data was found for "${patentNumber}". Check the patent number and try again.`,
    );
  }

  throw new Error(message || "Patent lookup failed. Please try again later.");
}

export function mapPatentLookupResponse(
  response: PatentLookupResponse,
  fallbackNumber: string,
): WizardPatentCandidate {
  const basicInfo = response.basic_info;
  const patentNumber =
    response.display_number || response.normalized_number || fallbackNumber;
  const abstractWordCount = response.abstract_words ?? 0;
  const descriptionWordCount = response.description_words ?? 0;
  const claimsWordCount = response.claims_words ?? 0;
  const claimsCount = response.claims_count ?? 0;
  const drawingCount =
    response.drawings?.drawing_page_count ??
    response.drawings?.drawing_labels?.length ??
    0;
  const sourceUrl =
    response.original_file_download_url ||
    response.original_file?.download_url ||
    "";
  const totalPages = resolveTotalPages(response);
  const priorities = normalizePriorities(response.priority_data);

  return {
    id: response.normalized_number || patentNumber,
    patentNumber,
    title: response.title || basicInfo?.title || patentNumber,
    jurisdiction: resolveJurisdiction(response.source, patentNumber),
    applicationNo:
      response.application_no || basicInfo?.application_number || "",
    publicationNo: response.publication_no || "",
    applicants: response.applicants || basicInfo?.applicants || [],
    inventors: response.inventors || basicInfo?.inventors || [],
    agents: normalizeRepresentatives(
      firstPopulated(
        response.agents,
        response.representatives,
        basicInfo?.representatives,
      ),
    ),
    priorities,
    description: response.abstract || basicInfo?.abstract || "",
    filingDate: formatPatentDate(response.application_date),
    publicationDate: formatPatentDate(
      response.publication_date || basicInfo?.publication_date,
    ),
    language: formatLanguage(response.language || response.publication_language),
    firstPriorityDate: formatPatentDate(
      response.first_priority_date || earliestPriorityDate(priorities),
    ),
    internationalFilingDate: formatPatentDate(
      response.international_filing_date
        || (response.source === "wipo" ? response.application_date : null),
    ),
    filingDeadline30Months: formatPatentDate(response.filing_deadline_30_months),
    filingDeadline31Months: formatPatentDate(response.filing_deadline_31_months),
    totalPages,
    legalStatus: "",
    technicalField:
      response.ipc?.[0] || basicInfo?.ipc?.[0] || response.cpc?.[0] || "patent",
    downloadableFiles: [
      buildPatentFile(response, patentNumber, sourceUrl, totalPages, {
        wordCount: abstractWordCount + descriptionWordCount + claimsWordCount,
        claimsCount,
        drawingCount,
      }),
    ],
    abstractWordCount: response.abstract_words ?? undefined,
    descriptionWordCount: response.description_words ?? undefined,
    claimsWordCount: response.claims_words ?? undefined,
    claimsCount: response.claims_count ?? undefined,
    drawingCount: resolveDrawingCount(response.drawings),
    source: response.source,
    publicationLanguage: formatLanguage(response.publication_language),
    filingLanguage: formatLanguage(response.filing_language),
    ipcCodes: response.ipc || basicInfo?.ipc || [],
    cpcCodes: response.cpc || basicInfo?.cpc || [],
    designatedStates: {
      regions: response.designated_states?.regions ?? [],
      countries: response.designated_states?.countries ?? [],
      protectionTypes: response.designated_states?.protection_types ?? [],
    },
    relatedPatentDocuments: response.related_patent_documents ?? [],
    sourceSnapshot: response as Record<string, unknown>,
  };
}

function buildPatentFile(
  response: PatentLookupResponse,
  patentNumber: string,
  sourceUrl: string,
  pageCount: number | undefined,
  metrics: { wordCount: number; claimsCount: number; drawingCount: number },
): WizardPatentFile {
  return {
    id: `${patentNumber}-original-document`,
    label: response.original_file?.filename || "Original patent document",
    fileType: resolveFileType(response.original_file),
    language: "",
    sourceUrl,
    pageCount: pageCount ?? 0,
    wordCount: metrics.wordCount,
    claimCount: metrics.claimsCount,
    drawingCount: metrics.drawingCount,
  };
}

function normalizeRepresentatives(
  representatives?: PatentRepresentative[],
): WizardPatentRepresentative[] {
  return (representatives ?? [])
    .map((representative) => ({
      name: representative.name?.trim() ?? "",
      organization: representative.organization?.trim() ?? "",
      address: representative.address?.trim() ?? "",
      country: representative.country?.trim() ?? "",
    }))
    .filter((representative) => Object.values(representative).some(Boolean));
}

function normalizePriorities(priorities?: PatentPriority[]): WizardPatentPriority[] {
  return (priorities ?? [])
    .map((priority) => ({
      number: priority.number?.trim() ?? "",
      date: formatPatentDate(priority.date),
      country: priority.country?.trim() ?? "",
      kind: priority.kind?.trim() ?? "",
    }))
    .filter((priority) => Object.values(priority).some(Boolean));
}

function earliestPriorityDate(priorities: WizardPatentPriority[]) {
  return priorities
    .map((priority) => priority.date)
    .filter(Boolean)
    .sort()[0];
}

function firstPopulated<T>(...values: Array<T[] | undefined>) {
  return values.find((value) => value?.length);
}

function resolveDrawingCount(drawings: PatentLookupResponse["drawings"]) {
  if (drawings?.drawing_page_count && drawings.drawing_page_count > 0) {
    return drawings.drawing_page_count;
  }
  return drawings?.drawing_labels?.length ? drawings.drawing_labels.length : undefined;
}

function resolveTotalPages(response: PatentLookupResponse) {
  const reported = response.total_pages
    ?? response.raw_source_refs?.ops_images?.page_count
    ?? response.raw_source_refs?.generated_pdf?.page_count;

  if (reported && reported > 0) return reported;

  const imagePages = response.raw_source_refs?.document_pages?.filter((page) =>
    /\.(?:tif|tiff|png|jpe?g)$/i.test(page)
  ).length;
  return imagePages ? imagePages : undefined;
}

function formatPatentDate(value?: string | null) {
  if (!value) return "";
  return /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
    : value;
}

function formatLanguage(value?: string | null) {
  if (!value) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(value.toLowerCase()) ?? value;
  } catch {
    return value.toUpperCase();
  }
}

function resolveJurisdiction(source: string | undefined, patentNumber: string) {
  if (source === "epo") return "EP";
  if (source === "wipo") return "WO";
  return patentNumber.slice(0, 2).toUpperCase();
}

function resolveFileType(originalFile: PatentLookupResponse["original_file"]) {
  const extension = originalFile?.filename?.split(".").pop();
  if (extension && extension !== originalFile?.filename) {
    return extension.toLowerCase();
  }
  return originalFile?.content_type === "text/plain" ? "txt" : "pdf";
}
