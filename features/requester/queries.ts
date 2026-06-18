import { getAuthenticatedUser, getRequesterOrganization } from "./server-utils";

export async function getRequesterDashboard() {
  const { supabase, userId, organization } = await getRequesterOrganization();

  if (!organization) {
    return { organization: null, stats: null, recentRequests: [], orders: [] };
  }

  const { data: requests } = await supabase
    .from("translation_requests")
    .select("id, request_no, title, requester_status, updated_at")
    .eq("requester_id", userId)
    .order("updated_at", { ascending: false });

  const requestRows = requests ?? [];

  return {
    organization,
    stats: {
      responding: requestRows.filter((request) => request.requester_status === "responding").length,
      negotiating: requestRows.filter((request) => request.requester_status === "negotiation").length,
      inProgress: requestRows.filter((request) => request.requester_status === "in_progress").length,
      rejected: requestRows.filter((request) => request.requester_status === "rejected").length,
      completed: requestRows.filter((request) => request.requester_status === "completed").length,
    },
    recentRequests: requestRows.slice(0, 3),
    orders: [],
  };
}

export async function getRequesterRequests(filters?: {
  status?: string;
  q?: string;
}) {
  const { supabase, userId, organization } = await getRequesterOrganization();

  if (!organization) {
    return { organization: null, requests: [] };
  }

  let query = supabase
    .from("translation_requests")
    .select(
      "id, request_no, title, requester_status, updated_at, request_files(id), translation_requirements(target_language), quotes(id, total_amount, currency, status, created_at), patent_searches(query)",
    )
    .eq("requester_id", userId)
    .order("updated_at", { ascending: false });

  if (filters?.status && filters.status !== "all") {
    query = query.eq("requester_status", filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const keyword = filters?.q?.toLowerCase().trim();
  const requests = keyword
    ? (data ?? []).filter((request) => {
        const patentQuery = (request.patent_searches ?? [])
          .map((search: { query: string }) => search.query)
          .join(" ");
        return [request.request_no, request.title, patentQuery]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
    : data ?? [];

  return { organization, requests };
}

export async function getRequesterRequest(requestId: string) {
  const { supabase } = await getAuthenticatedUser();
  const { data, error } = await supabase
    .from("translation_requests")
    .select(
      "*, request_files(*, file_parse_results(*), file_parse_jobs(*)), translation_requirements(*), quotes(*, quote_items(*), quote_factor_snapshots(*)), quote_negotiations(*, quote_negotiation_messages(*)), orders(*), request_events(*)",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function getRequesterQuote(requestId: string) {
  const request = await getRequesterRequest(requestId);
  const quotes = request?.quotes ?? [];
  const quote = [...quotes].sort((a, b) => b.version_no - a.version_no)[0] ?? null;

  return { request, quote };
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
    .select("*, translation_requests(*), quotes:accepted_quote_id(*), translation_tasks(*, task_deliverables(*))")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
