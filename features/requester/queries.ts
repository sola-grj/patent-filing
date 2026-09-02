import { getAuthenticatedUser, getRequesterOrganization } from "./server-utils";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveRequesterRequestScope } from "./request-scope";
import { isEpGrantingTranslation } from "./epo-tifg-upload";
import { recentDistinctSearches } from "./notifications";
import type { RequestDeadlineSource } from "./deadlines";
import type {
  DictionaryOption,
  WizardDictionaries,
  WizardDraftPayloadV2,
  WizardPatentAnalysisPart,
  WizardPatentAnalysisResult,
  WizardPatentCandidate,
  WizardPatentFile,
  WizardPayload,
  WizardUploadedFile,
} from "./wizard-types";
import type { ErpQuotePreview, ErpQuoteRow } from "@/lib/eci-erp/types";
import { measureServerOperation } from "@/lib/performance/server-timing";

const dictionaryCategoryMap = {
  request_channel: "channels",
  service_type: "serviceTypes",
  filing_type: "filingTypes",
  application_type: "applicationTypes",
  entity_type: "entityTypes",
  epv_type: "epvTypes",
  jurisdiction: "jurisdictions",
} as const;

export async function getRequesterDictionaries(): Promise<WizardDictionaries> {
  return getCachedRequesterDictionaries();
}
const getCachedRequesterDictionaries = unstable_cache(async (): Promise<WizardDictionaries> => {
  const supabase = createServiceClient();
  const [dictionaryResult, epCountriesResult] = await Promise.all([
    supabase
      .from("dictionary_items")
      .select("category, code, label, iso_country_code, country_group")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("ep_countries")
      .select("id, name, cname, abbr")
      .eq("enabled", true)
      .order("name", { ascending: true }),
  ]);

  if (dictionaryResult.error) throw new Error(dictionaryResult.error.message);
  if (epCountriesResult.error) throw new Error(epCountriesResult.error.message);

  const result: WizardDictionaries = {
    channels: [],
    serviceTypes: [],
    filingTypes: [],
    applicationTypes: [],
    entityTypes: [],
    epvTypes: [],
    epCountries: (epCountriesResult.data ?? []).map((country) => ({
      id: country.id,
      name: country.name,
      cname: country.cname,
      abbr: country.abbr,
    })),
    jurisdictions: [],
  };

  for (const item of dictionaryResult.data ?? []) {
    const key = dictionaryCategoryMap[item.category as keyof typeof dictionaryCategoryMap];
    if (!key) continue;
    const option: DictionaryOption = {
      value: item.code,
      label: item.label,
      isoCountryCode: item.iso_country_code ?? undefined,
      countryGroup: item.country_group ?? undefined,
    };
    result[key].push(option);
  }

  return result;
}, ["requester-dictionaries-v1"], { revalidate: 3600, tags: ["requester-dictionaries"] });

type DraftRow = {
  id: string;
  request_no: string;
  title: string | null;
  source_mode: "patent_search" | "upload";
  workflow_stage: string;
  updated_at: string;
  last_draft_step: string | null;
  draft_payload: Partial<WizardDraftPayloadV2> | null;
  request_patents?: Array<{
    patent_number: string;
    application_no: string | null;
    publication_no: string | null;
    title: string | null;
    abstract: string | null;
    jurisdiction: string | null;
    source: string | null;
    applicants: string[] | null;
    inventors: string[] | null;
    filing_date: string | null;
    publication_date: string | null;
    language: string | null;
    first_priority_date: string | null;
    international_filing_date: string | null;
    grant_publication_date: string | null;
    rule_71_3_communication_date: string | null;
    filing_deadline_30_months: string | null;
    filing_deadline_31_months: string | null;
    total_pages: number | null;
    legal_status: string | null;
    ipc_codes: string[] | null;
    cpc_codes: string[] | null;
    abstract_word_count: number | null;
    description_word_count: number | null;
    claims_word_count: number | null;
    claims_count: number | null;
    drawing_count: number | null;
  }> | null;
  patent_searches?: Array<{ query: string }> | null;
  translation_requirements?: Array<{
    service_types: string[] | null;
    ep_service_type_code: string | null;
    config_snapshot?: WizardDraftPayloadV2["config"] | null;
  }> | null;
  request_files?: Array<{
    id: string;
    source?: "patent_search" | "upload";
    status?: string;
    patent_document_id?: string | null;
    original_filename: string;
    mime_type: string | null;
    file_role?: string | null;
    language?: string | null;
    version_label?: string | null;
    metadata?: { size?: number } | null;
    file_parse_results?: DraftParseResult | DraftParseResult[] | null;
  }> | null;
  quotes?: Array<{
    status: string;
    currency: string;
    total_amount: number | string;
    valid_until: string | null;
    pricing_snapshot: Record<string, unknown> | null;
  }> | null;
};

type DraftParseResult = {
  parse_status: string;
  word_count: number;
  page_count: number;
  claim_count: number;
  structure_json: Record<string, unknown> | null;
  document_kind: string | null;
  source_url: string | null;
  retrieval_mode: "automatic" | "customer_upload" | null;
  document_language: string | null;
  publication_date: string | null;
  document_date: string | null;
  document_sha256: string | null;
  epo_document_id: string | null;
  is_pre_grant: boolean;
  is_legacy_pre_grant: boolean;
};

type RequesterQuoteMessage = {
  id: string;
  author_id?: string | null;
  body?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  adjustment_notes?: string | null;
  created_at: string;
};

export type RequesterRequestListRow = RequestDeadlineSource & {
  id: string;
  request_no: string;
  reference_no: string | null;
  requester_id: string;
  title: string | null;
  channel_code: string | null;
  requester_status: string;
  workflow_stage: string;
  submitted_at: string | null;
  updated_at: string;
  file_count: number;
  translation_requirements: Array<{
    source_language: string;
    target_language: string;
    target_languages: string[] | null;
    jurisdiction_codes: string[] | null;
    service_types: string[] | null;
    is_urgent: boolean;
    epv_type_code: string | null;
    ep_service_type_code: string | null;
    pct_chapter_code: string | null;
  }>;
  request_patents: Array<{
    patent_number: string;
    application_no: string | null;
    publication_no: string | null;
    first_priority_date: string | null;
    international_filing_date: string | null;
    grant_publication_date: string | null;
    rule_71_3_communication_date: string | null;
  }>;
  quotes: Array<{
    id: string;
    total_amount: number | string;
    currency: string;
    status: string;
    created_at: string;
  }>;
};

type RequesterQuoteNegotiationRow = {
  id: string;
  quote_id?: string | null;
  initiated_by?: string | null;
  expected_amount?: number | string | null;
  expected_delivery_at?: string | null;
  adjustment_notes?: string | null;
  reject_reason?: string | null;
  pm_decision?: string | null;
  status?: string | null;
  response_quote_id?: string | null;
  created_at: string;
  updated_at?: string | null;
  quote_negotiation_messages?: RequesterQuoteMessage[] | null;
};

export type RequesterQuoteHistoryMessage = {
  id: string;
  authorId: string | null;
  authorLabel: string;
  body: string;
  expectedAmount: number | string | null;
  expectedDeliveryAt: string | null;
  adjustmentNotes: string | null;
  createdAt: string;
};

export type RequesterQuoteHistoryEntry = {
  id: string;
  quoteId: string | null;
  initiatedBy: string | null;
  expectedAmount: number | string | null;
  expectedDeliveryAt: string | null;
  adjustmentNotes: string | null;
  rejectReason: string | null;
  pmDecision: string | null;
  status: string | null;
  responseQuoteId: string | null;
  createdAt: string;
  updatedAt: string | null;
  isLatest: boolean;
  messages: RequesterQuoteHistoryMessage[];
};

export type RequesterQuoteViewModel = {
  request: {
    id: string;
    request_no: string;
    requester_id: string;
    requester_status: string;
    viewer_is_owner: boolean;
    quote_negotiations: RequesterQuoteNegotiationRow[];
  } | null;
  quote: QuoteRow | null;
  latestNegotiation: RequesterQuoteHistoryEntry | null;
  isWaitingForPmFeedback: boolean;
  isPmInitiatedNegotiation: boolean;
  negotiationHistory: RequesterQuoteHistoryEntry[];
};

type QuoteRow = {
  id: string;
  version_no: number;
  status?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  estimated_delivery_at?: string | null;
  valid_until?: string | null;
  quote_items?: Array<{
    id: string;
    label: string;
    amount: number | string;
    description?: string | null;
  }> | null;
};

type OrderAssignmentContacts = {
  pm_names?: string | null;
  linguist_names?: string | null;
};

export async function getRequesterDashboard() {
  const { supabase, userId, email, organization } = await getRequesterOrganization();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const accountLabel = profile?.display_name || email;

  if (!organization) {
    return {
      organization: null,
      email: accountLabel,
      recentSearches: [],
    };
  }

  const { data: requests, error } = await supabase
    .from("translation_requests")
    .select("patent_searches(query, created_at)")
    .eq("requester_id", userId);
  if (error) throw new Error(error.message);
  const searches = (requests ?? []).flatMap((request) => request.patent_searches ?? []);

  return {
    organization,
    email: accountLabel,
    recentSearches: recentDistinctSearches(searches),
  };
}

export async function getRequesterRequests(filters?: {
  status?: string;
  channel?: string;
  q?: string;
  page?: number;
  scope?: "mine" | "organization";
}) {
  return measureServerOperation("requester.requests.list", () =>
    getRequesterRequestsInternal(filters));
}

async function getRequesterRequestsInternal(filters?: {
  status?: string;
  channel?: string;
  q?: string;
  page?: number;
  scope?: "mine" | "organization";
}) {
  const { supabase, organization, requestSharingEnabled } =
    await getRequesterOrganization();

  if (!organization) {
    return { organization: null, requests: [], totalCount: 0, totalPages: 0, page: 1, pageSize: 10, dictionaries: null, requestSharingEnabled: false, scope: "mine" as const };
  }

  const scope = resolveRequesterRequestScope(requestSharingEnabled, filters?.scope);
  const pageSize = 10;
  const [{ data, error }, dictionaries] = await Promise.all([
    supabase.rpc("get_requester_request_page", {
      p_status: filters?.status ?? null,
      p_channel: filters?.channel ?? null,
      p_query: filters?.q ?? null,
      p_page: Math.max(1, filters?.page ?? 1),
      p_page_size: pageSize,
      p_scope: scope,
    }),
    getRequesterDictionaries(),
  ]);
  if (error) {
    throw new Error(error.message);
  }
  const result = (data ?? {}) as {
    items?: RequesterRequestListRow[];
    total_count?: number;
    page?: number;
    page_size?: number;
  };
  const totalCount = Number(result.total_count ?? 0);
  const safePage = Number(result.page ?? 1);
  return {
    organization,
    requests: result.items ?? [],
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    page: safePage,
    pageSize,
    dictionaries,
    requestSharingEnabled,
    scope,
  };
}

export async function getRequesterRequest(requestId: string) {
  const { supabase, userId } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("translation_requests")
    .select(
      "id, request_no, reference_no, requester_id, channel_code, title, workflow_stage, requester_status, source_mode, submitted_at, updated_at, organizations:organizations!translation_requests_organization_id_fkey(id, name), request_files(id, source, status, updated_at, original_filename, mime_type, language, metadata, file_parse_results(word_count, page_count, claim_count, document_kind, source_url, retrieval_mode, document_language, publication_date, document_date, document_sha256, epo_document_id, is_pre_grant, is_legacy_pre_grant, structure_json)), request_patents(patent_number, title, abstract, jurisdiction, source, application_no, publication_no, applicants, inventors, filing_date, publication_date, language, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date, filing_deadline_30_months, filing_deadline_31_months, total_pages, legal_status, ipc_codes, cpc_codes, abstract_word_count, description_word_count, claims_word_count, claims_count, drawing_count, source_snapshot), translation_requirements(id, source_language, target_language, target_languages, scope_type, scope_details, purpose, service_types, entity_type, entity_type_code, filing_type_code, application_type_code, epv_type_code, ep_service_type_code, translation_required, service_item_code, opt_out_country_ids, pct_chapter_code, ep_country_ids, jurisdiction_codes, quality_level, delivery_option, due_at, is_urgent, config_snapshot), request_config_versions(id, version_no, config_snapshot), quotes(id, version_no, total_amount, currency, pricing_snapshot, breakdown_json, quote_items(label, amount)), quote_negotiations(initiated_by, expected_amount, expected_delivery_at, created_at, quote_negotiation_messages(author_id, expected_amount, expected_delivery_at, created_at)), orders(id, translation_tasks(id, task_deliverables(id, status, storage_path, created_at, version_no, language, ep_country_id, jurisdiction_code))), filing_signature_requests(id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at))",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.workflow_stage === "draft") {
    return null;
  }

  const dictionaries = await getRequesterDictionaries();
  const enrichedData = { ...data, ep_countries: dictionaries.epCountries };

  const order = firstRelation<{ id: string }>(
    (enrichedData?.orders as { id: string } | Array<{ id: string }> | null) ?? null,
  );

  if (!order?.id) {
    return { ...enrichedData, viewer_is_owner: enrichedData.requester_id === userId };
  }

  const { data: assignmentRows, error: assignmentError } = await supabase.rpc(
    "get_order_assignment_contacts",
    { target_order_id: order.id },
  );

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const assignmentContacts = ((assignmentRows ?? [])[0] ?? null) as OrderAssignmentContacts | null;
  const enrichedOrder = {
    ...order,
    assignment_contacts: assignmentContacts,
  };

  return {
    ...enrichedData,
    viewer_is_owner: enrichedData.requester_id === userId,
    orders: Array.isArray(enrichedData.orders) ? [enrichedOrder] : enrichedOrder,
  };
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export async function getRequesterDrafts(filters?: {
  channel?: string;
  service?: string;
  q?: string;
  page?: number;
}) {
  return measureServerOperation("requester.drafts.list", () =>
    getRequesterDraftsInternal(filters));
}

async function getRequesterDraftsInternal(filters?: {
  channel?: string;
  service?: string;
  q?: string;
  page?: number;
}) {
  const { supabase, organization } = await getRequesterOrganization();

  if (!organization) {
    return {
      organization: null,
      drafts: [],
      totalCount: 0,
      totalPages: 0,
      page: 1,
      pageSize: 10,
      dictionaries: null,
    };
  }

  const pageSize = 10;
  const [{ data, error }, dictionaries] = await Promise.all([
    supabase.rpc("get_requester_draft_page", {
      p_channel: filters?.channel ?? null,
      p_service: filters?.service ?? null,
      p_query: filters?.q ?? null,
      p_page: Math.max(1, filters?.page ?? 1),
      p_page_size: pageSize,
    }),
    getRequesterDictionaries(),
  ]);

  if (error) {
    throw new Error(error.message);
  }

  const result = (data ?? {}) as {
    items?: DraftRow[];
    total_count?: number;
    page?: number;
  };
  const totalCount = Number(result.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Number(result.page ?? 1);
  return {
    organization,
    drafts: result.items ?? [],
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
    dictionaries,
  };
}

export async function getRequesterDraft(draftId: string) {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("translation_requests")
    .select("id, request_no, title, source_mode, workflow_stage, updated_at, last_draft_step, draft_payload, patent_searches(query), translation_requirements(service_types, ep_service_type_code, config_snapshot), request_patents(patent_number, application_no, publication_no, title, abstract, jurisdiction, source, applicants, inventors, filing_date, publication_date, language, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date, filing_deadline_30_months, filing_deadline_31_months, total_pages, legal_status, ipc_codes, cpc_codes, abstract_word_count, description_word_count, claims_word_count, claims_count, drawing_count), request_files(id, source, status, patent_document_id, original_filename, mime_type, file_role, language, version_label, metadata, file_parse_results(parse_status, word_count, page_count, claim_count, structure_json, document_kind, source_url, retrieval_mode, document_language, publication_date, document_date, document_sha256, epo_document_id, is_pre_grant, is_legacy_pre_grant)), quotes(status, currency, total_amount, valid_until, pricing_snapshot)")
    .eq("id", draftId)
    .eq("workflow_stage", "draft")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapDraftRowToWizardState(data as DraftRow);
}

export async function getRequesterQuote(requestId: string): Promise<RequesterQuoteViewModel> {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase.rpc("get_requester_quote_detail", {
    p_request_id: requestId,
  });
  if (error && error.code !== "P0002") throw new Error(error.message);
  const detail = (data ?? null) as {
    request: {
      id: string;
      request_no: string;
      requester_id: string;
      requester_status: string;
      viewer_is_owner: boolean;
      quote_negotiations: RequesterQuoteNegotiationRow[];
    };
    quote: QuoteRow | null;
  } | null;
  const request = detail?.request ?? null;
  const quote = detail?.quote ?? null;
  const negotiationRows = ((request?.quote_negotiations ?? []) as RequesterQuoteNegotiationRow[])
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime());
  const latestNegotiationRow = negotiationRows[negotiationRows.length - 1] ?? null;
  const negotiationHistory = negotiationRows.map((negotiation, index) =>
    mapNegotiationHistoryEntry(
      negotiation,
      index === negotiationRows.length - 1,
      request?.requester_id ?? null,
    )
  );

  return {
    request,
    quote,
    latestNegotiation: negotiationHistory[negotiationHistory.length - 1] ?? null,
    isWaitingForPmFeedback:
      request?.requester_status === "negotiation" &&
      latestNegotiationRow?.status === "open" &&
      latestNegotiationRow?.initiated_by === request?.requester_id &&
      latestNegotiationRow?.pm_decision === "pending",
    isPmInitiatedNegotiation:
      request?.requester_status === "negotiation" &&
      latestNegotiationRow?.status === "open" &&
      Boolean(
        latestNegotiationRow?.initiated_by &&
          latestNegotiationRow.initiated_by !== request?.requester_id,
      ),
    negotiationHistory,
  };
}

export async function getRequesterOrders() {
  const { supabase, userId, organization } = await getRequesterOrganization();

  if (!organization) {
    return { organization: null, orders: [] };
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_no, status, updated_at, translation_requests(request_no, title), quotes:accepted_quote_id(total_amount, currency, estimated_delivery_at)")
    .eq("requester_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return {
    organization,
    orders: (data ?? []).map((order) => ({
      ...order,
      translation_requests: firstRelation(order.translation_requests),
      quotes: firstRelation(order.quotes),
    })),
  };
}

export async function getRequesterOrder(orderId: string) {
  const { supabase } = await getAuthenticatedUser();
  const [orderResult, dictionaries] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_no, status, confirmed_at, translation_requests(id, request_no, title, translation_requirements(ep_country_ids, jurisdiction_codes, config_snapshot), request_config_versions(version_no, config_snapshot)), quotes:accepted_quote_id(id, total_amount, currency, estimated_delivery_at), translation_tasks(id, task_type, status, task_deliverables(id, version_no, status, storage_path, created_at, language, ep_country_id, jurisdiction_code))")
      .eq("id", orderId)
      .maybeSingle(),
    getRequesterDictionaries(),
  ]);
  const { data, error } = orderResult;

  if (error) {
    throw new Error(error.message);
  }

  return data ? {
    ...data,
    translation_requests: firstRelation(data.translation_requests),
    quotes: firstRelation(data.quotes),
    ep_countries: dictionaries.epCountries,
  } : data;
}

function mapDraftRowToWizardState(draft: DraftRow) {
  const payload = draft.draft_payload ?? {};
  const persistedConfig = payload.config
    ?? firstRelated(draft.translation_requirements)?.config_snapshot;
  const uploadedFiles = draft.source_mode === "upload" && (payload.uploadedFiles?.length ?? 0) > 0
    ? payload.uploadedFiles ?? []
    : mapDraftRequestFiles(relatedArray(draft.request_files));
  const patent = firstRelated(draft.request_patents);
  const requestFiles = relatedArray(draft.request_files);
  const patentFiles = requestFiles.filter((file) => file.source === "patent_search");
  const uploadedRequestFiles = requestFiles.filter((file) => file.source === "upload");
  const usesCustomerTifg = Boolean(
    persistedConfig && isEpGrantingTranslation(persistedConfig),
  );
  const analysisFiles = usesCustomerTifg ? uploadedRequestFiles : patentFiles;
  const selectedPatent = patent
    ? mapDraftPatent(patent, patentFiles)
    : undefined;
  const analysis = patent && analysisFiles.length && firstParseResult(analysisFiles[0])
    ? mapDraftPatentAnalysis(patent, analysisFiles)
    : undefined;
  const quotePreview = mapDraftQuote(draft.quotes);

  return {
    requestId: draft.id,
    requestNo: draft.request_no,
    payload: {
      sourceMode: payload.sourceMode ?? draft.source_mode,
      patentQuery: payload.patentQuery ?? draft.patent_searches?.[0]?.query ?? "",
      selectedPatent,
      selectedPatentFileIds: patentFiles.map((file) => file.id),
      uploadedFiles,
      analysis,
      quoteCurrency: payload.quoteCurrency,
      quotePreview,
      config: persistedConfig ?? undefined,
      lastStep: payload.lastStep ?? draft.last_draft_step ?? "Source",
    } satisfies Partial<WizardPayload>,
  };
}

function relatedArray<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstRelated<T>(value: T[] | T | null | undefined): T | undefined {
  return relatedArray(value)[0];
}

function mapDraftQuote(quotes: DraftRow["quotes"]): ErpQuotePreview | undefined {
  const quote = quotes?.find((item) => item.status === "draft");
  const snapshot = quote?.pricing_snapshot;
  const rows = Array.isArray(snapshot?.response) ? snapshot.response as ErpQuoteRow[] : null;
  if (!quote || !rows?.length || typeof snapshot?.quotedAt !== "string" || typeof snapshot.customerName !== "string") {
    return undefined;
  }
  if (quote.currency !== "CNY" && quote.currency !== "USD" && quote.currency !== "EUR" && quote.currency !== "GBP" && quote.currency !== "HKD") {
    return undefined;
  }
  return {
    source: "eci_erp",
    currency: quote.currency,
    quotedAt: snapshot.quotedAt,
    customerName: snapshot.customerName,
    validUntil: typeof snapshot.validUntil === "string" ? snapshot.validUntil : quote.valid_until ?? undefined,
    rows,
    total: numberValue(quote.total_amount),
  };
}

function mapDraftRequestFiles(
  requestFiles: NonNullable<DraftRow["request_files"]>,
): WizardUploadedFile[] {
  return requestFiles.filter((file) => file.source === "upload").map((file) => ({
    requestFileId: file.id,
    name: file.original_filename,
    size: file.metadata?.size ?? 0,
    type: file.mime_type ?? "",
  }));
}

function mapDraftPatent(
  patent: NonNullable<DraftRow["request_patents"]>[number],
  files: NonNullable<DraftRow["request_files"]>,
): WizardPatentCandidate {
  const downloadableFiles = files.map(mapDraftPatentFile);
  const documentKind = firstParseResult(files[0])?.document_kind;
  return {
    id: patent.patent_number,
    patentNumber: patent.patent_number,
    title: patent.title ?? "",
    jurisdiction: patent.jurisdiction ?? "EP",
    applicationNo: patent.application_no ?? "",
    publicationNo: patent.publication_no ?? patent.patent_number,
    applicants: patent.applicants ?? [],
    inventors: patent.inventors ?? [],
    description: patent.abstract ?? "",
    filingDate: patent.filing_date ?? "",
    publicationDate: patent.publication_date ?? "",
    language: patent.language ?? undefined,
    firstPriorityDate: patent.first_priority_date ?? undefined,
    internationalFilingDate: patent.international_filing_date ?? undefined,
    grantPublicationDate: patent.grant_publication_date ?? undefined,
    rule713CommunicationDate: patent.rule_71_3_communication_date ?? undefined,
    hasB1Publication: documentKind === "B1",
    filingDeadline30Months: patent.filing_deadline_30_months ?? undefined,
    filingDeadline31Months: patent.filing_deadline_31_months ?? undefined,
    totalPages: patent.total_pages ?? 0,
    legalStatus: patent.legal_status ?? "",
    technicalField: patent.ipc_codes?.[0] ?? "patent",
    downloadableFiles,
    abstractWordCount: patent.abstract_word_count ?? 0,
    descriptionWordCount: patent.description_word_count ?? 0,
    claimsWordCount: patent.claims_word_count ?? 0,
    claimsCount: patent.claims_count ?? 0,
    drawingCount: patent.drawing_count ?? 0,
    source: patent.source ?? undefined,
    ipcCodes: patent.ipc_codes ?? [],
    cpcCodes: patent.cpc_codes ?? [],
    dataOrigin: "official",
  };
}

function mapDraftPatentFile(
  file: NonNullable<DraftRow["request_files"]>[number],
): WizardPatentFile {
  const result = firstParseResult(file);
  return {
    id: file.id,
    label: file.version_label ?? result?.document_kind ?? "Official document",
    fileType: "pdf",
    language: file.language ?? result?.document_language ?? "",
    sourceUrl: "",
    pageCount: result?.page_count ?? 0,
    wordCount: result?.word_count ?? 0,
    claimCount: result?.claim_count ?? 0,
    drawingCount: 0,
  };
}

function mapDraftPatentAnalysis(
  patent: NonNullable<DraftRow["request_patents"]>[number],
  files: NonNullable<DraftRow["request_files"]>,
): WizardPatentAnalysisResult {
  const analysisFiles = files.map((file) => {
    const result = firstParseResult(file);
    const structure = result?.structure_json ?? {};
    const parts = (structure.parts ?? {}) as Record<string, unknown>;
    return {
      filename: file.original_filename,
      file_type: "pdf" as const,
      sha256: result?.document_sha256 ?? "",
      status: result?.parse_status === "needs_review" ? "partial" as const : "success" as const,
      parts: {
        abstract: normalizeDraftPart(parts.abstract),
        abstract_drawing: normalizeDraftPart(parts.abstract_drawing),
        description: normalizeDraftPart(parts.description),
        description_drawings: normalizeDraftPart(parts.description_drawings),
        claims: normalizeDraftPart(parts.claims),
        unclassified: normalizeDraftPart(parts.unclassified),
      },
      document_text_words: numberValue(structure.document_text_words),
      drawing_ocr_words: numberValue(structure.drawing_ocr_words),
      total_words: result?.word_count ?? 0,
      claims_count: result?.claim_count ?? 0,
      warnings: [] as string[],
    };
  });
  const aggregateSource = (
    firstParseResult(files[0])?.structure_json?.aggregate ?? {}
  ) as Record<string, unknown>;
  const storedStructure = (
    firstParseResult(files[0])?.structure_json ?? {}
  ) as Record<string, unknown>;
  const aggregate = {
    abstract_words: numberValue(aggregateSource.abstract_words),
    abstract_drawing_words: numberValue(aggregateSource.abstract_drawing_words),
    description_words: numberValue(aggregateSource.description_words),
    description_drawings_words: numberValue(aggregateSource.description_drawings_words),
    claims_words: numberValue(aggregateSource.claims_words),
    claims_count: numberValue(aggregateSource.claims_count, patent.claims_count ?? 0),
    unclassified_words: numberValue(aggregateSource.unclassified_words),
    total_words: numberValue(
      aggregateSource.total_words,
      analysisFiles.reduce((sum, file) => sum + file.total_words, 0),
    ),
  };
  const source = firstParseResult(files[0]);
  const isPartial = analysisFiles.some((file) => file.status === "partial");
  return {
    input_mode: source?.retrieval_mode === "customer_upload" ? "upload" : "patent_number",
    status: isPartial ? "partial" : "success",
    restored_from_storage: true,
    analysis_profile: storedStructure.analysis_profile === "claims_only"
      ? "claims_only"
      : "full_document",
    patent_number: patent.patent_number,
    source_document: source ? {
      strategy: "generated_cache",
      source: patent.source === "wipo" ? "wipo" : "epo",
      normalized_number: patent.patent_number,
      kind_code: source.document_kind === "B1" ? "B1" : null,
      document_kind: source.document_kind,
      filename: files[0].original_filename,
      mime_type: files[0].mime_type ?? "application/pdf",
      upstream_url: source.source_url,
      source_url: source.source_url,
      retrieval_mode: source.retrieval_mode ?? "automatic",
      language: source.document_language,
      publication_date: source.publication_date,
      document_date: source.document_date,
      sha256: source.document_sha256,
      epo_document_id: source.epo_document_id,
      application_number: patent.application_no,
      is_pre_grant: source.is_pre_grant,
      is_legacy_pre_grant: source.is_legacy_pre_grant,
      strategy_version: "b1_then_tifg_v2",
    } : null,
    counting_standard: "Stored verified patent analysis",
    excluded_content: [],
    files: analysisFiles,
    aggregate,
    warnings: [],
  };
}

function firstParseResult(
  file?: NonNullable<DraftRow["request_files"]>[number],
) {
  const result = file?.file_parse_results;
  return Array.isArray(result) ? result[0] : result ?? null;
}

function normalizeDraftPart(value: unknown): WizardPatentAnalysisPart {
  const part = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  const status = part.status;
  return {
    word_count: numberValue(part.word_count),
    status: status === "parsed" || status === "parse_failed"
      ? status
      : "not_present",
    method: typeof part.method === "string" ? part.method : "stored",
    confidence: typeof part.confidence === "string" ? part.confidence : "high",
  };
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function mapNegotiationHistoryEntry(
  negotiation: RequesterQuoteNegotiationRow,
  isLatest: boolean,
  requesterId?: string | null,
): RequesterQuoteHistoryEntry {
  const messages = [...(negotiation.quote_negotiation_messages ?? [])]
    .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
    .map((message) => ({
      id: message.id,
      authorId: message.author_id ?? null,
      authorLabel:
        message.author_id && requesterId && message.author_id === requesterId
          ? "Requester"
          : "PM feedback",
      body: message.body?.trim() || "No message provided.",
      expectedAmount: message.expected_amount ?? null,
      expectedDeliveryAt: message.expected_delivery_at ?? null,
      adjustmentNotes: message.adjustment_notes ?? null,
      createdAt: message.created_at,
    }));

  return {
    id: negotiation.id,
    quoteId: negotiation.quote_id ?? null,
    initiatedBy: negotiation.initiated_by ?? null,
    expectedAmount: negotiation.expected_amount ?? null,
    expectedDeliveryAt: negotiation.expected_delivery_at ?? null,
    adjustmentNotes: negotiation.adjustment_notes ?? null,
    rejectReason: negotiation.reject_reason ?? null,
    pmDecision: negotiation.pm_decision ?? null,
    status: negotiation.status ?? null,
    responseQuoteId: negotiation.response_quote_id ?? null,
    createdAt: negotiation.created_at,
    updatedAt: negotiation.updated_at ?? null,
    isLatest,
    messages,
  };
}
