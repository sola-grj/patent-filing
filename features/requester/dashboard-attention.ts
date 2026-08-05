export type DashboardAttentionItem = {
  id: string;
  requestId: string;
  kind: "urgent" | "download" | "signature";
  title: string;
  detail: string;
  action: string;
  href: string;
  tone: "red" | "amber" | "green";
  timestamp: string;
  dueTimestamp?: number;
};

type DashboardRequest = {
  id: string;
  request_no: string;
  title?: string | null;
  requester_status?: string | null;
  workflow_stage?: string | null;
  updated_at: string;
  translation_requirements?:
    | { is_urgent?: boolean | null }
    | Array<{ is_urgent?: boolean | null }>
    | null;
  request_patents?:
    | { patent_number?: string | null }
    | Array<{ patent_number?: string | null }>
    | null;
  filing_signature_requests?: Array<{
    id: string;
    status?: string | null;
    due_at?: string | null;
    sent_at?: string | null;
    filing_signature_files?: Array<{
      id: string;
      direction?: string | null;
    }> | null;
  }> | null;
};

type DashboardOrder = {
  id: string;
  request_id: string;
  completed_at?: string | null;
  updated_at: string;
  translation_tasks?: Array<{
    id: string;
    task_deliverables?: Array<{
      id: string;
      status?: string | null;
      created_at: string;
    }> | null;
  }> | null;
};

export function buildDashboardAttentionItems(
  requests: DashboardRequest[],
  orders: DashboardOrder[],
) {
  const requestById = new Map(requests.map((request) => [request.id, request]));
  const signatureItems = requests
    .flatMap(signatureAttentionItems)
    .sort(sortSignatureItems);
  const urgentItems = requests
    .filter(isActiveUrgentRequest)
    .map(urgentAttentionItem)
    .sort(sortByNewest);
  const downloadItems = orders
    .map((order) => downloadAttentionItem(order, requestById.get(order.request_id)))
    .filter((item): item is DashboardAttentionItem => Boolean(item))
    .sort(sortByNewest);
  return selectBalancedItems(signatureItems, urgentItems, downloadItems);
}

function signatureAttentionItems(request: DashboardRequest) {
  return (request.filing_signature_requests ?? [])
    .filter((signatureRequest) => signatureRequest.status === "sent")
    .map((signatureRequest): DashboardAttentionItem => {
      const fileCount = (signatureRequest.filing_signature_files ?? [])
        .filter((file) => file.direction === "pm_to_requester").length;
      const dateDetail = signatureRequest.due_at
        ? `Due ${formatShortDate(signatureRequest.due_at)}`
        : `Sent ${formatShortDate(signatureRequest.sent_at ?? request.updated_at)}`;

      return {
        id: `signature-${signatureRequest.id}`,
        requestId: request.id,
        kind: "signature",
        title: "Documents require your signature",
        detail: `${request.request_no} · ${fileCount} ${fileCount === 1 ? "file" : "files"} · ${dateDetail}`,
        action: "Review & sign",
        href: `/requester/requests/${request.id}#signature-documents`,
        tone: "amber",
        timestamp: signatureRequest.sent_at ?? request.updated_at,
        dueTimestamp: signatureRequest.due_at
          ? new Date(`${signatureRequest.due_at}T00:00:00Z`).getTime()
          : Number.MAX_SAFE_INTEGER,
      };
    });
}

function isActiveUrgentRequest(request: DashboardRequest) {
  const requirement = firstRelation(request.translation_requirements);

  return Boolean(
    requirement?.is_urgent
      && request.workflow_stage !== "draft"
      && request.requester_status !== "completed"
      && request.requester_status !== "rejected",
  );
}

function urgentAttentionItem(request: DashboardRequest): DashboardAttentionItem {
  return {
    id: `urgent-${request.id}`,
    requestId: request.id,
    kind: "urgent",
    title: requestMatter(request),
    detail: `${request.request_no} · ${titleCase(request.requester_status)}`,
    action: "View request",
    href: `/requester/requests/${request.id}`,
    tone: "red",
    timestamp: request.updated_at,
  };
}

function downloadAttentionItem(
  order: DashboardOrder,
  request?: DashboardRequest,
): DashboardAttentionItem | null {
  if (!request || request.requester_status !== "completed") {
    return null;
  }

  const latestDeliverable = (order.translation_tasks ?? [])
    .flatMap((task) => task.task_deliverables ?? [])
    .filter((deliverable) => deliverable.status && deliverable.status !== "draft")
    .sort(sortByNewest)[0];

  if (!latestDeliverable) {
    return null;
  }

  const completedAt = order.completed_at ?? latestDeliverable.created_at ?? order.updated_at;

  return {
    id: `download-${latestDeliverable.id}`,
    requestId: request.id,
    kind: "download",
    title: "Delivery ready to download",
    detail: `${requestMatter(request)} · Completed ${formatShortDate(completedAt)}`,
    action: "Download",
    href: `/requester/orders/${order.id}/deliverables/${latestDeliverable.id}`,
    tone: "green",
    timestamp: completedAt,
  };
}

function selectBalancedItems(
  signatureItems: DashboardAttentionItem[],
  urgentItems: DashboardAttentionItem[],
  downloadItems: DashboardAttentionItem[],
) {
  const selected: DashboardAttentionItem[] = [];
  const usedRequestIds = new Set<string>();

  for (const item of signatureItems) {
    addIfAvailable(item, selected, usedRequestIds);
  }

  for (const item of [urgentItems[0], downloadItems[0]]) {
    addIfAvailable(item, selected, usedRequestIds);
  }

  const remainingItems = [...urgentItems, ...downloadItems]
    .sort(sortByNewest);

  for (const item of remainingItems) {
    addIfAvailable(item, selected, usedRequestIds);
    if (selected.length === 3) {
      break;
    }
  }

  return selected.slice(0, 3);
}

function sortSignatureItems(
  left: DashboardAttentionItem,
  right: DashboardAttentionItem,
) {
  const dueDifference = (left.dueTimestamp ?? Number.MAX_SAFE_INTEGER)
    - (right.dueTimestamp ?? Number.MAX_SAFE_INTEGER);
  return dueDifference || sortByNewest(left, right);
}

function addIfAvailable(
  item: DashboardAttentionItem | undefined,
  selected: DashboardAttentionItem[],
  usedRequestIds: Set<string>,
) {
  if (!item || selected.length >= 3 || usedRequestIds.has(item.requestId)) {
    return;
  }

  selected.push(item);
  usedRequestIds.add(item.requestId);
}

function requestMatter(request: DashboardRequest) {
  const patent = firstRelation(request.request_patents);

  return patent?.patent_number || request.title?.trim() || request.request_no;
}

function firstRelation<T>(value?: T | T[] | null) {
  if (!value) {
    return null;
  }

  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function sortByNewest<T extends { timestamp?: string; created_at?: string }>(
  left: T,
  right: T,
) {
  const leftDate = left.timestamp ?? left.created_at ?? "0";
  const rightDate = right.timestamp ?? right.created_at ?? "0";

  return new Date(rightDate).getTime() - new Date(leftDate).getTime();
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function titleCase(value?: string | null) {
  if (!value) {
    return "Active";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
