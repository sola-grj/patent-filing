import { requirePmContext } from "./server-utils";
import { createServiceClient } from "@/lib/supabase/server";

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
  const page = Math.max(1, filters?.page ?? 1);
  const [
    { data, error },
    { data: dictionaryItems, error: dictionaryError },
  ] = await Promise.all([
    context.supabase
      .from("translation_requests")
      .select(
        "id, request_no, requester_id, title, channel_code, workflow_stage, pm_status, requester_status, updated_at, submitted_at, organizations:organizations!translation_requests_organization_id_fkey(id, name), request_files(id), request_patents(patent_number, application_no, publication_no, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date), translation_requirements(source_language, target_language, target_languages, service_types, is_urgent, jurisdiction_codes, epv_type_code, ep_service_type_code, pct_chapter_code), quotes(id, total_amount, currency, status, created_at), quote_negotiations(id, status, pm_decision, created_at), orders(id, status, offline_confirmation_status)",
      )
      .eq("supplier_organization_id", context.organization!.id)
      .neq("workflow_stage", "draft")
      .order("updated_at", { ascending: false }),
    context.supabase
      .from("dictionary_items")
      .select("category, code, label")
      .in("category", ["request_channel", "service_type"])
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  if (error) {
    throw new Error(error.message);
  }
  if (dictionaryError) {
    throw new Error(dictionaryError.message);
  }

  const allRequests = data ?? [];
  const customerNames = await getRequesterCustomerNames(
    allRequests.map((request) => request.requester_id),
  );
  const requestsWithCustomerNames = allRequests.map((request) => ({
    ...request,
    customer_name: customerNames.get(request.requester_id) ?? null,
  }));
  const normalizedStatus = normalizePmStatusFilter(filters?.status, filters?.stage);
  const keyword = filters?.q?.toLowerCase().trim();
  const requests = requestsWithCustomerNames.filter((request) => {
    const organization = firstRelation(request.organizations);
    const patent = firstRelation(request.request_patents);

    if (normalizedStatus && request.pm_status !== normalizedStatus) {
      return false;
    }
    if (filters?.channel && request.channel_code !== filters.channel) {
      return false;
    }
    if (filters?.customer && organization?.id !== filters.customer) {
      return false;
    }
    if (keyword) {
      return [
        request.request_no,
        request.title,
        patent?.patent_number,
        request.customer_name,
        organization?.name,
      ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
    }
    return true;
  });

  const totalCount = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const dictionaries = {
    channels: (dictionaryItems ?? [])
      .filter((item) => item.category === "request_channel")
      .map((item) => ({ value: item.code, label: item.label })),
    serviceTypes: (dictionaryItems ?? [])
      .filter((item) => item.category === "service_type")
      .map((item) => ({ value: item.code, label: item.label })),
  };
  const customers = Array.from(
    new Map(
      requestsWithCustomerNames.flatMap((request) => {
        const organization = firstRelation(request.organizations);
        const customerName = request.customer_name ?? organization?.name;
        return organization?.id && customerName
          ? [[organization.id, customerName] as const]
          : [];
      }),
    ),
    ([value, label]) => ({ value, label }),
  ).sort((left, right) => left.label.localeCompare(right.label));

  return {
    denied: false,
    requests: requests.slice((safePage - 1) * pageSize, safePage * pageSize),
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
    dictionaries,
    customers,
  };
}

async function getRequesterCustomerNames(requesterIds: Array<string | null>) {
  const uniqueRequesterIds = [...new Set(requesterIds.filter(Boolean))] as string[];
  if (!uniqueRequesterIds.length) return new Map<string, string>();

  const { data, error } = await createServiceClient()
    .from("eci_erp_customers")
    .select("auth_user_id, client_name")
    .in("auth_user_id", uniqueRequesterIds)
    .is("sync_error", null);
  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).flatMap((customer) =>
      customer.auth_user_id && customer.client_name.trim()
        ? [[customer.auth_user_id, customer.client_name.trim()] as const]
        : [],
    ),
  );
}

export async function getPmRequestDetail(requestId: string) {
  const context = await requirePmContext();

  if (context.denied) {
    return { denied: true, request: null, currentUserId: null };
  }

  const { data, error } = await context.supabase
    .from("translation_requests")
    .select(
      "*, organizations:organizations!translation_requests_organization_id_fkey(id, name, type), request_files(*, file_parse_results(*), file_parse_jobs(*)), request_patents(*), patent_searches(*, patent_candidates(*, patent_file_versions(*))), translation_requirements(*), request_config_versions(*), quotes(*, quote_items(*), quote_factor_snapshots(*)), quote_negotiations(*, quote_negotiation_messages(*)), orders(*, translation_tasks(*, task_deliverables(*))), request_events(*), filing_signature_requests(*, filing_signature_files(*))",
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

  const { data: epCountries, error: epCountriesError } = await context.supabase
    .from("ep_countries")
    .select("id, name, cname, abbr")
    .eq("enabled", true)
    .order("name", { ascending: true });
  if (epCountriesError) throw new Error(epCountriesError.message);

  return {
    denied: false,
    request: data ? { ...data, ep_countries: epCountries ?? [] } : data,
    currentUserId: context.userId,
  };
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}
