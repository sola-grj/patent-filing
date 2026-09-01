import { addCalendarMonths, buildDashboardDeadlineItems, type RequestDeadlineSource } from "./deadlines.ts";

export const requesterNotificationTypes = [
  "filing_signature_required",
  "request_completed",
  "request_deadline_approaching",
] as const;

export type RequesterNotificationType = (typeof requesterNotificationTypes)[number];

export type RequesterNotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type RequesterNotificationItem = {
  id: string;
  type: RequesterNotificationType;
  title: string;
  detail: string;
  meta: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export type NotificationSeed = {
  recipient_id: string;
  type: RequesterNotificationType;
  entity_type: string;
  entity_id: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
};

export type CompletedRequestSource = {
  id: string;
  requester_id: string;
  request_no: string;
  title?: string | null;
  requester_status?: string | null;
  workflow_stage?: string | null;
  updated_at: string;
  request_patents?: Array<{ patent_number?: string | null }> | null;
  orders?: Array<{
    completed_at?: string | null;
    updated_at?: string | null;
    translation_tasks?: Array<{
      task_deliverables?: Array<{
        status?: string | null;
        created_at?: string | null;
      }> | null;
    }> | null;
  }> | null;
};

export function isRequesterNotificationType(value: string): value is RequesterNotificationType {
  return requesterNotificationTypes.includes(value as RequesterNotificationType);
}

export function toRequesterNotificationItem(
  row: RequesterNotificationRow,
): RequesterNotificationItem | null {
  if (!isRequesterNotificationType(row.type)) return null;
  const payload = row.payload ?? {};
  const requestNo = stringValue(payload.requestNo) ?? "Request";
  const matter = stringValue(payload.matter) ?? requestNo;
  const href = safeRequesterHref(payload.href, payload.requestId);

  if (row.type === "filing_signature_required") {
    const fileCount = numberValue(payload.fileCount);
    const dueAt = stringValue(payload.dueAt);
    return {
      id: row.id,
      type: row.type,
      title: "Documents require your signature",
      detail: `${matter} · ${fileCount ?? 0} ${(fileCount ?? 0) === 1 ? "file" : "files"}`,
      meta: dueAt ? `Due ${formatDate(dueAt)}` : requestNo,
      href,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  }

  if (row.type === "request_completed") {
    const completedAt = stringValue(payload.completedAt) ?? row.created_at;
    return {
      id: row.id,
      type: row.type,
      title: "Delivery ready to download",
      detail: `${matter} · ${requestNo}`,
      meta: `Completed ${formatDate(completedAt)}`,
      href,
      readAt: row.read_at,
      createdAt: row.created_at,
    };
  }

  const dueOn = stringValue(payload.dueOn);
  const service = stringValue(payload.service);
  return {
    id: row.id,
    type: row.type,
    title: stringValue(payload.deadlineTitle) ?? "Request deadline approaching",
    detail: `${matter} · ${requestNo}`,
    meta: [dueOn ? `Due ${formatDate(dueOn)}` : null, service].filter(Boolean).join(" · "),
    href,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

export function buildDeadlineNotificationSeeds(
  requests: Array<RequestDeadlineSource & { requester_id: string }>,
  today = new Date().toISOString().slice(0, 10),
) {
  const nextMonth = addCalendarMonths(today, 1);
  if (!nextMonth) return [];
  const requestById = new Map(requests.map((request) => [request.id, request]));

  return buildDashboardDeadlineItems(requests, today)
    .filter((deadline) => deadline.dueOn >= today && deadline.dueOn < nextMonth)
    .map((deadline): NotificationSeed => {
      const request = requestById.get(deadline.requestId)!;
      const deadlineIdentity = deadline.id.slice(`${deadline.requestId}:`.length);
      return {
        recipient_id: request.requester_id,
        type: "request_deadline_approaching",
        entity_type: "translation_request",
        entity_id: deadline.requestId,
        dedupe_key: `deadline:${deadline.requestId}:${deadlineIdentity}`,
        payload: {
          requestId: deadline.requestId,
          requestNo: request.request_no,
          matter: deadline.detail,
          deadlineTitle: deadline.title,
          dueOn: deadline.dueOn,
          service: deadline.service,
          href: `${deadline.href}#request-deadline`,
        },
      };
    });
}

export function buildCompletedNotificationSeed(
  request: CompletedRequestSource,
): NotificationSeed | null {
  if (request.requester_status !== "completed" || request.workflow_stage !== "completed") {
    return null;
  }
  const published = (request.orders ?? [])
    .flatMap((order) => order.translation_tasks ?? [])
    .flatMap((task) => task.task_deliverables ?? [])
    .filter((deliverable) => ["submitted", "accepted"].includes(deliverable.status ?? ""));
  if (!published.length) return null;
  const completedAt = newestTimestamp([
    request.updated_at,
    ...(request.orders ?? []).flatMap((order) => [order.completed_at, order.updated_at]),
    ...published.map((deliverable) => deliverable.created_at),
  ]);
  const matter = request.request_patents?.[0]?.patent_number
    ?? request.title?.trim()
    ?? request.request_no;

  return {
    recipient_id: request.requester_id,
    type: "request_completed",
    entity_type: "translation_request",
    entity_id: request.id,
    dedupe_key: `completed:${request.id}`,
    payload: {
      requestId: request.id,
      requestNo: request.request_no,
      matter,
      completedAt,
      deliverableCount: published.length,
      href: `/requester/requests/${request.id}#deliverables`,
    },
  };
}

export function recentDistinctSearches(
  searches: Array<{ query?: string | null; created_at?: string | null }>,
  limit = 3,
) {
  const seen = new Set<string>();
  return [...searches]
    .sort((left, right) => String(right.created_at ?? "").localeCompare(String(left.created_at ?? "")))
    .flatMap((search) => {
      const query = search.query?.trim();
      if (!query) return [];
      const key = query.normalize("NFKC").toUpperCase();
      if (seen.has(key)) return [];
      seen.add(key);
      return [query];
    })
    .slice(0, limit);
}

function safeRequesterHref(value: unknown, requestId: unknown) {
  if (typeof value === "string" && /^\/requester\/requests\/[0-9a-f-]+(?:[?#].*)?$/i.test(value)) {
    return value;
  }
  if (typeof requestId === "string" && /^[0-9a-f-]+$/i.test(requestId)) {
    return `/requester/requests/${requestId}`;
  }
  return "/requester/requests";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function newestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.localeCompare(left))[0];
}
