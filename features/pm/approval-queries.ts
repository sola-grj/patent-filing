import { requirePmContext } from "@/features/pm/server-utils";
import { createServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;

const approvalListSelect = "id, approval_type, status, submitted_by, submitted_at, request_id, subject_id, sent_at, translation_requests!inner(request_no, title, organization_id, organizations:organizations!translation_requests_organization_id_fkey(name))" as const;

const approvalDetailSelect = "id, approval_type, status, submitted_by, submitted_at, reviewed_by, reviewed_at, decision_reason, request_id, subject_id, sent_at, payload_snapshot, translation_requests(id, request_no, title, organizations:organizations!translation_requests_organization_id_fkey(name), translation_requirements(ep_service_type_code, translation_required, config_snapshot)), quotes(id, version_no, status, notes, total_amount, currency, breakdown_json, pricing_snapshot, quote_items(label, amount))" as const;
const previousQuoteSelect = "id, version_no, status, notes, total_amount, currency, breakdown_json, pricing_snapshot, quote_items(label, amount)" as const;

export async function getQuoteRevisionApprovals(input: {
  customer?: string;
  pm?: string;
  status?: string;
  q?: string;
  page?: number;
}) {
  const context = await requirePmContext();
  if (context.denied || !context.isSupplierAdmin) {
    return { denied: true as const, items: [], page: 1, totalPages: 0, totalCount: 0, userId: null, customers: [], pms: [] };
  }
  const page = Math.max(1, input.page ?? 1);
  let query = context.supabase
    .from("approval_requests")
    .select(approvalListSelect, { count: "exact" })
    .eq("approval_type", "quote_revision")
    .order("submitted_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (input.customer && input.customer !== "all") {
    query = query.eq("translation_requests.organization_id", input.customer);
  }
  if (input.pm && input.pm !== "all") query = query.eq("submitted_by", input.pm);
  if (input.status === "sent") query = query.not("sent_at", "is", null);
  if (input.status && !["all", "sent"].includes(input.status)) {
    query = query.eq("status", input.status).is("sent_at", null);
  }
  const search = sanitizeSearch(input.q);
  if (search) {
    query = query.or(`request_no.ilike.*${search}*,title.ilike.*${search}*`, {
      referencedTable: "translation_requests",
    });
  }
  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  const submitterIds = [...new Set((data ?? []).map((approval) => approval.submitted_by))];
  const service = createServiceClient();
  const [{ data: submitters, error: submittersError }, filterOptions] = await Promise.all([
    submitterIds.length
      ? service.from("profiles").select("user_id, display_name, email").in("user_id", submitterIds)
      : Promise.resolve({ data: [], error: null }),
    getApprovalFilterOptions(context),
  ]);
  if (submittersError) throw new Error(submittersError.message);
  const submitterById = new Map((submitters ?? []).map((profile) => [profile.user_id, profile]));
  const totalCount = count ?? 0;
  return {
    denied: false as const,
    items: (data ?? []).map((approval) => ({
      ...approval,
      submitter: submitterById.get(approval.submitted_by) ?? null,
    })),
    page,
    totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    totalCount,
    userId: context.userId,
    ...filterOptions,
  };
}

export async function getQuoteRevisionApprovalDetail(approvalId: string) {
  const context = await requirePmContext();
  if (context.denied || !context.isSupplierAdmin) {
    return { denied: true as const, approval: null };
  }

  const { data, error } = await context.supabase
    .from("approval_requests")
    .select(approvalDetailSelect)
    .eq("id", approvalId)
    .eq("approval_type", "quote_revision")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { denied: false as const, approval: null };

  const profileIds = [data.submitted_by, data.reviewed_by].filter(
    (value): value is string => Boolean(value),
  );
  const submittedVersion = approvalSnapshotVersion(data.payload_snapshot)
    ?? relationArray(data.quotes)[0]?.version_no
    ?? null;
  const service = createServiceClient();
  const [profilesResult, previousQuoteResult] = await Promise.all([
    profileIds.length
      ? service.from("profiles").select("user_id, display_name, email").in("user_id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    submittedVersion && submittedVersion > 1
      ? context.supabase
          .from("quotes")
          .select(previousQuoteSelect)
          .eq("request_id", data.request_id)
          .eq("version_no", submittedVersion - 1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const { data: profiles, error: profilesError } = profilesResult;
  if (profilesError) throw new Error(profilesError.message);
  if (previousQuoteResult.error) throw new Error(previousQuoteResult.error.message);
  const profileById = new Map(
    (profiles ?? []).map((profile) => [profile.user_id, profile]),
  );

  return {
    denied: false as const,
    approval: {
      ...data,
      submitter: profileById.get(data.submitted_by) ?? null,
      reviewer: data.reviewed_by
        ? profileById.get(data.reviewed_by) ?? null
        : null,
      previousQuote: previousQuoteResult.data,
    },
  };
}

async function getApprovalFilterOptions(
  context: Awaited<ReturnType<typeof requirePmContext>> & { denied: false },
) {
  const supabase = context.supabase;
  const customersQuery = context.isSuperAdmin
    ? supabase.from("organizations").select("id, name").eq("type", "customer").order("name").limit(500)
    : supabase
        .from("customer_supplier_relationships")
        .select("customer:organizations!customer_supplier_relationships_customer_organization_id_fkey(id, name)")
        .eq("supplier_organization_id", context.organization!.id)
        .eq("status", "active")
        .limit(500);
  let membersQuery = supabase
    .from("organization_members")
    .select("user_id")
    .eq("role", "pm")
    .limit(500);
  if (!context.isSuperAdmin) membersQuery = membersQuery.eq("organization_id", context.organization!.id);
  const [customersResult, membersResult] = await Promise.all([customersQuery, membersQuery]);
  if (customersResult.error) throw new Error(customersResult.error.message);
  if (membersResult.error) throw new Error(membersResult.error.message);
  const pmIds = [...new Set((membersResult.data ?? []).map((member) => member.user_id))];
  const { data: profiles, error: profilesError } = pmIds.length
    ? await supabase.from("profiles").select("user_id, display_name, email").in("user_id", pmIds).order("display_name")
    : { data: [], error: null };
  if (profilesError) throw new Error(profilesError.message);
  const customerRows = context.isSuperAdmin
    ? (customersResult.data ?? []) as unknown as Array<{ id: string; name: string }>
    : ((customersResult.data ?? []) as unknown as Array<{
        customer: { id: string; name: string } | Array<{ id: string; name: string }> | null;
      }>).flatMap((row) => relationArray(row.customer));
  return {
    customers: uniqueOptions(customerRows.map((row) => ({ value: row.id, label: row.name }))),
    pms: uniqueOptions((profiles ?? []).map((profile) => ({
      value: profile.user_id,
      label: profile.display_name || profile.email || "PM",
    }))),
  };
}

function sanitizeSearch(value?: string) {
  return value?.trim().replace(/[(),.*]/g, " ").replace(/\s+/g, " ") || "";
}

function approvalSnapshotVersion(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const quote = (value as Record<string, unknown>).quote;
  if (!quote || typeof quote !== "object" || Array.isArray(quote)) return null;
  const version = Number((quote as Record<string, unknown>).version_no);
  return Number.isInteger(version) ? version : null;
}

function relationArray<T>(value: T | T[] | null) {
  return !value ? [] : Array.isArray(value) ? value : [value];
}

function uniqueOptions(options: Array<{ value: string; label: string }>) {
  return [...new Map(options.map((option) => [option.value, option])).values()]
    .sort((left, right) => left.label.localeCompare(right.label));
}
