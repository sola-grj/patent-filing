import { requirePmContext } from "./server-utils";

export const pmLifecycleBuckets = [
  { status: "responding" },
  { status: "negotiation" },
  { status: "in_progress" },
  { status: "rejected" },
  { status: "completed" },
] as const;

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

export async function getPmDashboard() {
  const context = await requirePmContext();

  if (context.denied) {
    return { denied: true, organization: null, buckets: [], recentRequests: [] };
  }

  const { data, error } = await context.supabase
    .from("translation_requests")
    .select(
      "id, request_no, title, workflow_stage, pm_status, updated_at, translation_requirements(is_urgent), organizations(id, name), quotes(id, total_amount, currency, status, created_at), quote_negotiations(id, status, pm_decision, created_at), orders(id, status, offline_confirmation_status)",
    )
    .neq("workflow_stage", "draft")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const requests = data ?? [];

  return {
    denied: false,
    organization: context.organization,
    buckets: pmLifecycleBuckets.map((bucket) => ({
      ...bucket,
      count: requests.filter((request) => request.pm_status === bucket.status).length,
    })),
    recentRequests: requests.slice(0, 3),
  };
}

export async function getPmRequests(filters?: {
  status?: string;
  stage?: string;
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
    };
  }

  const pageSize = 10;
  const page = Math.max(1, filters?.page ?? 1);
  let query = context.supabase
    .from("translation_requests")
    .select(
      "id, request_no, title, workflow_stage, pm_status, requester_status, updated_at, submitted_at, organizations(id, name), request_files(id), translation_requirements(source_language, target_language, target_languages, is_urgent), quotes(id, total_amount, currency, status, created_at), quote_negotiations(id, status, pm_decision, created_at), orders(id, status, offline_confirmation_status)",
    )
    .neq("workflow_stage", "draft")
    .order("updated_at", { ascending: false });

  const normalizedStatus = normalizePmStatusFilter(filters?.status, filters?.stage);
  if (normalizedStatus) {
    query = query.eq("pm_status", normalizedStatus);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  const keyword = filters?.q?.toLowerCase().trim();
  const requests = keyword
    ? (data ?? []).filter((request) => {
        const organization = firstRelation(request.organizations);
        return [request.request_no, request.title, organization?.name]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
    : data ?? [];

  const totalCount = requests.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);

  return {
    denied: false,
    requests: requests.slice((safePage - 1) * pageSize, safePage * pageSize),
    totalCount,
    totalPages,
    page: safePage,
    pageSize,
  };
}

export async function getPmRequestDetail(requestId: string) {
  const context = await requirePmContext();

  if (context.denied) {
    return { denied: true, request: null, translators: [], currentUserId: null };
  }

  const { data, error } = await context.supabase
    .from("translation_requests")
    .select(
      "*, organizations(id, name, type), request_files(*, file_parse_results(*), file_parse_jobs(*)), patent_searches(*, patent_candidates(*, patent_file_versions(*))), translation_requirements(*), request_config_versions(*), quotes(*, quote_items(*), quote_factor_snapshots(*)), quote_negotiations(*, quote_negotiation_messages(*)), orders(*, translation_tasks(*, task_deliverables(*))), request_events(*)",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (data?.workflow_stage === "draft") {
    return { denied: false, request: null, translators: [], currentUserId: context.userId };
  }

  const order = firstRelation(
    (data?.orders as Array<{ translation_tasks?: Array<{ assigned_translator_id?: string | null }> }> | null) ??
      null,
  );
  const assignedTranslatorIds = [
    ...new Set(
      (order?.translation_tasks ?? [])
        .map((task) => task.assigned_translator_id)
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  const { data: translatorMembers, error: memberError } = await context.supabase
    .from("organization_members")
    .select("user_id")
    .eq("role", "translator");

  if (memberError) {
    throw new Error(memberError.message);
  }

  const translatorIds = [
    ...new Set([
      ...((translatorMembers ?? []).map((member) => member.user_id)),
      ...assignedTranslatorIds,
    ]),
  ];

  let translators: Array<{
    userId: string;
    label: string;
    email: string | null;
    isSelectable: boolean;
  }> = [];

  if (translatorIds.length) {
    const { data: profiles, error: profileError } = await context.supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .in("user_id", translatorIds);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const translatorIdSet = new Set((translatorMembers ?? []).map((member) => member.user_id));
    translators = translatorIds.map((userId) => {
      const profile = (profiles ?? []).find((item) => item.user_id === userId);
      return {
        userId,
        label:
          profile?.display_name?.trim() ||
          profile?.email?.trim() ||
          userId,
        email: profile?.email ?? null,
        isSelectable: translatorIdSet.has(userId),
      };
    }).sort((left, right) => left.label.localeCompare(right.label));
  }

  return { denied: false, request: data, translators, currentUserId: context.userId };
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}
