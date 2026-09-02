import { requirePmContext } from "./server-utils";
import { getRequesterDictionaries } from "@/features/requester/queries";
import type { RequestDeadlineSource } from "@/features/requester/deadlines";
import { measureServerOperation } from "@/lib/performance/server-timing";

type PmRequestListRow = RequestDeadlineSource & {
  id: string;
  request_no: string;
  requester_id: string;
  title: string | null;
  channel_code: string | null;
  workflow_stage: string;
  pm_status: string;
  requester_status: string;
  updated_at: string;
  submitted_at: string | null;
  customer_name: string | null;
  organizations: Array<{ id: string; name: string }>;
  file_count: number;
  request_patents: Array<{
    patent_number: string;
    application_no: string | null;
    publication_no: string | null;
    first_priority_date: string | null;
    international_filing_date: string | null;
    grant_publication_date: string | null;
    rule_71_3_communication_date: string | null;
  }>;
  translation_requirements: Array<{
    source_language: string;
    target_language: string;
    target_languages: string[] | null;
    service_types: string[] | null;
    is_urgent: boolean;
    jurisdiction_codes: string[] | null;
    epv_type_code: string | null;
    ep_service_type_code: string | null;
    pct_chapter_code: string | null;
  }>;
  quotes: Array<{
    id: string;
    total_amount: number | string;
    currency: string;
    status: string;
    created_at: string;
  }>;
  quote_negotiations: Array<{
    id: string;
    status: string;
    pm_decision: string;
    created_at: string;
  }>;
  orders: Array<{
    id: string;
    status: string;
    offline_confirmation_status: string;
  }>;
};

export function normalizePmStatusFilter(status?: string, stage?: string) {
  if (status && status !== "all") {
    return status;
  }

  switch (stage) {
    case "configured":
    case "quoted":
      return "responding";
    case "negotiation":
      return "negotiation";
    case "order_pending":
    case "production":
      return "in_progress";
    case "completed":
      return "completed";
    case "closed":
      return "rejected";
    default:
      return undefined;
  }
}
export async function getPmRequests(filters?: {
  status?: string;
  stage?: string;
  channel?: string;
  customer?: string;
  q?: string;
  page?: number;
}) {
  return measureServerOperation("pm.requests.list", () => getPmRequestsInternal(filters));
}

async function getPmRequestsInternal(filters?: {
  status?: string;
  stage?: string;
  channel?: string;
  customer?: string;
  q?: string;
  page?: number;
}) {
  const context = await requirePmContext();

  if (context.denied) {
    return {
      denied: true,
      requests: [],
      totalCount: 0,
      totalPages: 0,
      page: 1,
      pageSize: 10,
      dictionaries: { channels: [], serviceTypes: [] },
      customers: [],
    };
  }

  const pageSize = 10;
  const [{ data, error }, allDictionaries] = await Promise.all([
    context.supabase.rpc("get_pm_request_page", {
      p_status: normalizePmStatusFilter(filters?.status, filters?.stage) ?? null,
      p_channel: filters?.channel ?? null,
      p_customer: filters?.customer && filters.customer !== "all" ? filters.customer : null,
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
    items?: PmRequestListRow[];
    customers?: Array<{ value: string; label: string }>;
    total_count?: number;
    page?: number;
  };
  const totalCount = Number(result.total_count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Number(result.page ?? 1);
  const dictionaries = {
    channels: allDictionaries.channels,
    serviceTypes: allDictionaries.serviceTypes,
  };

  return {
    denied: false,
    requests: result.items ?? [],
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
    dictionaries,
    customers: result.customers ?? [],
  };
}

export async function getPmRequestDetail(requestId: string) {
  const context = await requirePmContext();

  if (context.denied) {
    return { denied: true, request: null, currentUserId: null };
  }

  const { data, error } = await context.supabase
    .from("translation_requests")
    .select(
      "id, request_no, title, workflow_stage, requester_status, pm_status, source_mode, channel_code, submitted_at, updated_at, organizations:organizations!translation_requests_organization_id_fkey(id, name, type), request_files(id, source, status, updated_at, original_filename, mime_type, language, metadata, file_parse_results(word_count, page_count, claim_count, document_kind, source_url, retrieval_mode, document_language, publication_date, document_date, document_sha256, epo_document_id, is_pre_grant, is_legacy_pre_grant, structure_json)), request_patents(patent_number, title, abstract, jurisdiction, source, application_no, publication_no, applicants, inventors, filing_date, publication_date, language, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date, filing_deadline_30_months, filing_deadline_31_months, total_pages, legal_status, ipc_codes, cpc_codes, abstract_word_count, description_word_count, claims_word_count, claims_count, drawing_count, source_snapshot), patent_searches(patent_candidates(metadata)), translation_requirements(source_language, target_language, target_languages, scope_type, purpose, service_types, entity_type, quality_level, delivery_option, due_at, is_urgent, scope_details, filing_type_code, application_type_code, entity_type_code, epv_type_code, ep_service_type_code, translation_required, service_item_code, opt_out_country_ids, pct_chapter_code, ep_country_ids, jurisdiction_codes, config_snapshot), request_config_versions(version_no, config_snapshot), quotes(id, version_no, status, total_amount, currency, estimated_delivery_at, valid_until, pricing_snapshot, breakdown_json, quote_items(id, label, amount, description)), quote_negotiations(id, initiated_by, quote_id, expected_amount, expected_delivery_at, adjustment_notes, reject_reason, pm_decision, status, response_quote_id, created_at, updated_at, quote_negotiation_messages(id, author_id, body, expected_amount, expected_delivery_at, adjustment_notes, created_at)), orders(id, order_no, status, offline_confirmation_status, confirmed_at, started_at, translation_tasks(id, request_file_id, assigned_translator_id, status, task_type, started_at, task_deliverables(id, version_no, status, storage_path, created_at, language, ep_country_id, jurisdiction_code))), request_events(id, event_type, from_status, to_status, payload, created_at), filing_signature_requests(id, request_id, created_by, recipient_id, recipient_name, recipient_email, status, pm_note, due_at, sent_at, completed_at, cancelled_at, email_status, email_provider_id, email_last_error, email_sent_at, email_attempt_count, created_at, updated_at, filing_signature_files(id, direction, ep_country_id, storage_bucket, storage_path, original_filename, mime_type, file_size, uploaded_by, created_at))",
    )
    .eq("id", requestId)
    .eq("supplier_organization_id", context.organization!.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.workflow_stage === "draft") {
    return { denied: false, request: null, currentUserId: context.userId };
  }

  const dictionaries = await getRequesterDictionaries();

  return {
    denied: false,
    request: data ? { ...data, ep_countries: dictionaries.epCountries } : data,
    currentUserId: context.userId,
  };
}
