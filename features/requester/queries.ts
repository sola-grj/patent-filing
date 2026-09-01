import { getAuthenticatedUser, getRequesterOrganization } from "./server-utils";
import { resolveRequesterRequestScope } from "./request-scope";
import { buildDashboardAttentionItems } from "./dashboard-attention";
import { buildDashboardDeadlineItems } from "./deadlines";
import { isEpGrantingTranslation } from "./epo-tifg-upload";
import { normalizeRequestSearchTerm } from "./requester-routes";
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
  const { supabase } = await getAuthenticatedUser();
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
}

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
  request: Awaited<ReturnType<typeof getRequesterRequest>>;
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
      stats: null,
      recentRequests: [],
      recentDrafts: [],
      draftCount: 0,
      attentionItems: [],
      deadlineItems: [],
      orders: [],
      dictionaries: null,
    };
  }

  const [
    { data: requests, error: requestsError },
    { data: orders, error: ordersError },
    dictionaries,
  ] = await Promise.all([
    supabase
      .from("translation_requests")
      .select("id, request_no, title, source_mode, channel_code, requester_status, workflow_stage, submitted_at, updated_at, last_draft_step, draft_payload, translation_requirements(is_urgent, service_types, epv_type_code, ep_service_type_code, jurisdiction_codes, pct_chapter_code), request_patents(patent_number, application_no, publication_no, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date), filing_signature_requests(id, status, due_at, sent_at, filing_signature_files(id, direction))")
      .eq("requester_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("orders")
      .select("id, request_id, completed_at, updated_at, translation_tasks(id, task_deliverables(id, status, created_at, ep_country_id, jurisdiction_code, version_no))")
      .eq("requester_id", userId)
      .order("updated_at", { ascending: false }),
    getRequesterDictionaries(),
  ]);

  if (requestsError) {
    throw new Error(requestsError.message);
  }
  if (ordersError) {
    throw new Error(ordersError.message);
  }

  const requestRows = requests ?? [];
  const activeRequests = requestRows.filter((request) => request.workflow_stage !== "draft");
  const drafts = requestRows.filter((request) => request.workflow_stage === "draft");

  return {
    organization,
    email: accountLabel,
    stats: {
      responding: activeRequests.filter((request) => request.requester_status === "responding").length,
      negotiating: activeRequests.filter((request) => request.requester_status === "negotiation").length,
      inProgress: activeRequests.filter((request) => request.requester_status === "in_progress").length,
      rejected: activeRequests.filter((request) => request.requester_status === "rejected").length,
      completed: activeRequests.filter((request) => request.requester_status === "completed").length,
    },
    recentRequests: activeRequests.slice(0, 3),
    recentDrafts: drafts.slice(0, 8),
    draftCount: drafts.length,
    attentionItems: buildDashboardAttentionItems(requestRows, orders ?? []),
    deadlineItems: buildDashboardDeadlineItems(requestRows),
    orders: orders ?? [],
    dictionaries,
  };
}

export async function getRequesterRequests(filters?: {
  status?: string;
  channel?: string;
  q?: string;
  page?: number;
  scope?: "mine" | "organization";
}) {
  const { supabase, userId, organization, requestSharingEnabled } =
    await getRequesterOrganization();

  if (!organization) {
    return { organization: null, requests: [], totalCount: 0, totalPages: 0, page: 1, pageSize: 10, dictionaries: null, requestSharingEnabled: false, scope: "mine" as const };
  }

  const pageSize = 10;
  const page = Math.max(1, filters?.page ?? 1);

  const scope = resolveRequesterRequestScope(requestSharingEnabled, filters?.scope);
  let query = supabase
    .from("translation_requests")
    .select(
      "id, request_no, reference_no, requester_id, title, channel_code, requester_status, updated_at, request_files(id), translation_requirements(source_language, target_language, target_languages, jurisdiction_codes, service_types, is_urgent), request_patents(patent_number), quotes(id, total_amount, currency, status, created_at), patent_searches(query)",
    )
    .neq("workflow_stage", "draft")
    .order("updated_at", { ascending: false });

  query = scope === "organization"
    ? query.eq("organization_id", organization.id).neq("requester_id", userId)
    : query.eq("requester_id", userId);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("requester_status", filters.status);
  }
  if (filters?.channel && filters.channel !== "all") {
    query = query.eq("channel_code", filters.channel);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const keyword = filters?.q?.toLowerCase().trim();
  const normalizedKeyword = keyword
    ? normalizeRequestSearchTerm(keyword)
    : "";
  const requests = keyword
    ? (data ?? []).filter((request) => {
        const patentQuery = (request.patent_searches ?? [])
          .map((search: { query: string }) => search.query)
          .join(" ");
        const requestPatent = Array.isArray(request.request_patents)
          ? request.request_patents[0]
          : request.request_patents;
        const searchableValues = [
          request.request_no,
          request.reference_no,
          request.title,
          patentQuery,
          requestPatent?.patent_number,
        ];
        const displaySearchValue = searchableValues
          .join(" ")
          .toLowerCase();
        const patentSearchValue = searchableValues
          .map((value) => normalizeRequestSearchTerm(String(value ?? "")))
          .join(" ");

        return displaySearchValue.includes(keyword)
          || Boolean(
            normalizedKeyword
            && patentSearchValue.includes(normalizedKeyword),
          );
      }).sort((left, right) => {
        const leftExactReference = left.reference_no?.trim().toLowerCase() === keyword;
        const rightExactReference = right.reference_no?.trim().toLowerCase() === keyword;
        return Number(rightExactReference) - Number(leftExactReference);
      })
    : data ?? [];

  const totalCount = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRequests = requests.slice((safePage - 1) * pageSize, safePage * pageSize);

  const dictionaries = await getRequesterDictionaries();
  return {
    organization,
    requests: paginatedRequests,
    totalCount,
    totalPages,
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
      "*, organizations:organizations!translation_requests_organization_id_fkey(id, name), request_files(*, file_parse_results(*), file_parse_jobs(*)), patent_searches(*, patent_candidates(*, patent_file_versions(*))), request_patents(*), translation_requirements(*), request_config_versions(*), quotes(*, quote_items(*), quote_factor_snapshots(*)), quote_negotiations(*, quote_negotiation_messages(*)), orders(*, translation_tasks(id, assigned_pm_id, assigned_translator_id, status, task_type, started_at, task_deliverables(id, status, storage_path, created_at, version_no, language, ep_country_id, jurisdiction_code))), request_events(*), filing_signature_requests(*, filing_signature_files(*))",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.workflow_stage === "draft") {
    return null;
  }

  const { data: epCountries, error: epCountriesError } = await supabase
    .from("ep_countries")
    .select("id, name, cname, abbr")
    .eq("enabled", true)
    .order("name", { ascending: true });
  if (epCountriesError) throw new Error(epCountriesError.message);

  const enrichedData = data ? { ...data, ep_countries: epCountries ?? [] } : data;

  const order = firstRelation<{ id: string }>(
    (enrichedData?.orders as { id: string } | Array<{ id: string }> | null) ?? null,
  );

  if (!order?.id) {
    return enrichedData
      ? { ...enrichedData, viewer_is_owner: enrichedData.requester_id === userId }
      : enrichedData;
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
    viewer_is_owner: enrichedData!.requester_id === userId,
    orders: Array.isArray(enrichedData!.orders) ? [enrichedOrder] : enrichedOrder,
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
  const { supabase, userId, organization } = await getRequesterOrganization();

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
  const page = Math.max(1, filters?.page ?? 1);

  const { data, error } = await supabase
    .from("translation_requests")
    .select("id, request_no, title, source_mode, workflow_stage, updated_at, last_draft_step, draft_payload, request_patents(patent_number, title), patent_searches(query), translation_requirements(service_types, ep_service_type_code), request_files(id, source, status, patent_document_id, original_filename, mime_type, metadata)")
    .eq("requester_id", userId)
    .eq("workflow_stage", "draft")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const drafts = (data ?? []).filter((draft) => matchesRequesterDraftFilters(draft, filters));
  const totalCount = drafts.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedDrafts = drafts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const dictionaries = await getRequesterDictionaries();
  return {
    organization,
    drafts: paginatedDrafts,
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
    dictionaries,
  };
}

function matchesRequesterDraftFilters(
  draft: Pick<DraftRow, "request_no" | "title" | "source_mode" | "last_draft_step" | "draft_payload" | "patent_searches" | "translation_requirements" | "request_files"> & {
    request_patents?: Array<Pick<
      NonNullable<DraftRow["request_patents"]>[number],
      "patent_number" | "title"
    >> | null;
  },
  filters?: { channel?: string; service?: string; q?: string },
) {
  const payload = draft.draft_payload ?? {};
  const channel = draft.source_mode === "upload"
    ? "upload_files"
    : payload.config?.channelCode ?? "";
  const services = draft.translation_requirements?.[0]?.service_types
    ?? payload.config?.serviceTypes
    ?? [];
  if (filters?.channel && filters.channel !== "all" && channel !== filters.channel) {
    return false;
  }
  if (filters?.service && filters.service !== "all" && !services.includes(filters.service)) {
    return false;
  }
  const keyword = filters?.q?.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  return [
    draft.request_no,
    draft.title,
    payload.patentQuery,
    draft.patent_searches?.[0]?.query,
    draft.request_patents?.[0]?.patent_number,
    draft.request_patents?.[0]?.title,
    ...(draft.request_files ?? []).map((file) => file.original_filename),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);
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
  const request = await getRequesterRequest(requestId);
  const quotes = (request?.quotes ?? []) as QuoteRow[];
  const quote = [...quotes].sort((a, b) => b.version_no - a.version_no)[0] ?? null;
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
    .select("*, translation_requests(request_no, title), quotes:accepted_quote_id(total_amount, currency, estimated_delivery_at)")
    .eq("requester_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return { organization, orders: data ?? [] };
}

export async function getRequesterOrder(orderId: string) {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("orders")
    .select("*, translation_requests(*, translation_requirements(ep_country_ids, jurisdiction_codes, config_snapshot), request_config_versions(version_no, config_snapshot)), quotes:accepted_quote_id(*), translation_tasks(*, task_deliverables(*))")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const { data: epCountries, error: epCountriesError } = await supabase
    .from("ep_countries")
    .select("id, name, cname, abbr")
    .eq("enabled", true)
    .order("name", { ascending: true });
  if (epCountriesError) throw new Error(epCountriesError.message);

  return data ? { ...data, ep_countries: epCountries ?? [] } : data;
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
