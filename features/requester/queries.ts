import { getAuthenticatedUser, getRequesterOrganization } from "./server-utils";
import { resolveRequesterRequestScope } from "./request-scope";
import { buildDashboardAttentionItems } from "./dashboard-attention";
import { buildDashboardDeadlineItems } from "./deadlines";
import { normalizeRequestSearchTerm } from "./requester-routes";
import type {
  DictionaryOption,
  WizardDictionaries,
  WizardPayload,
  WizardUploadedFile,
} from "./wizard-types";

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
  draft_payload: Partial<WizardPayload> | null;
  request_files?: Array<{
    id: string;
    original_filename: string;
    mime_type: string | null;
    metadata?: { size?: number } | null;
  }> | null;
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
      "id, request_no, requester_id, title, channel_code, requester_status, updated_at, request_files(id), translation_requirements(source_language, target_language, target_languages, jurisdiction_codes, service_types, is_urgent), request_patents(patent_number), quotes(id, total_amount, currency, status, created_at), patent_searches(query)",
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
  step?: string;
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
    .select("id, request_no, title, source_mode, updated_at, last_draft_step, draft_payload")
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
  draft: Pick<DraftRow, "request_no" | "title" | "source_mode" | "last_draft_step" | "draft_payload">,
  filters?: { channel?: string; service?: string; step?: string; q?: string },
) {
  const payload = draft.draft_payload ?? {};
  const channel = draft.source_mode === "upload"
    ? "upload_files"
    : payload.config?.channelCode ?? "";
  const services = payload.config?.serviceTypes ?? [];
  const step = normalizeDraftStep(payload.lastStep ?? draft.last_draft_step);

  if (filters?.channel && filters.channel !== "all" && channel !== filters.channel) {
    return false;
  }
  if (filters?.service && filters.service !== "all" && !services.includes(filters.service)) {
    return false;
  }
  if (filters?.step && filters.step !== "all" && step !== filters.step) {
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
    payload.selectedPatent?.patentNumber,
    payload.selectedPatent?.title,
    ...(payload.uploadedFiles ?? []).map((file) => file.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(keyword);
}

function normalizeDraftStep(step?: string | null) {
  if (!step || ["Basics", "Parse", "Patent Detail"].includes(step)) {
    return "Source";
  }

  return step;
}

export async function getRequesterDraft(draftId: string) {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("translation_requests")
    .select("id, request_no, title, source_mode, workflow_stage, updated_at, last_draft_step, draft_payload, request_files(id, original_filename, mime_type, metadata)")
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
  const uploadedFiles = payload.sourceMode === "upload" && (payload.uploadedFiles?.length ?? 0) > 0
    ? payload.uploadedFiles ?? []
    : mapDraftRequestFiles(draft.request_files ?? []);

  return {
    requestId: draft.id,
    requestNo: draft.request_no,
    payload: {
      sourceMode: payload.sourceMode ?? draft.source_mode,
      patentQuery: payload.patentQuery ?? "",
      selectedPatent: payload.selectedPatent,
      selectedPatentFileIds: payload.selectedPatentFileIds ?? [],
      uploadedFiles,
      analysis: payload.analysis,
      config: payload.config,
      lastStep: payload.lastStep ?? draft.last_draft_step ?? "Source",
    } satisfies Partial<WizardPayload>,
  };
}

function mapDraftRequestFiles(
  requestFiles: NonNullable<DraftRow["request_files"]>,
): WizardUploadedFile[] {
  return requestFiles.map((file) => ({
    requestFileId: file.id,
    name: file.original_filename,
    size: file.metadata?.size ?? 0,
    type: file.mime_type ?? "",
  }));
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
