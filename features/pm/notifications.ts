export const pmNotificationTypes = [
  "pm_request_submitted",
  "pm_quote_confirmed",
  "pm_signed_documents_received",
] as const;

export type PmNotificationType = (typeof pmNotificationTypes)[number];

export type PmNotificationRow = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
};

export type PmNotificationItem = {
  id: string;
  type: PmNotificationType;
  title: string;
  detail: string;
  meta: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export function toPmNotificationItem(row: PmNotificationRow): PmNotificationItem | null {
  if (!pmNotificationTypes.includes(row.type as PmNotificationType)) return null;

  const payload = row.payload ?? {};
  const requestNo = stringValue(payload.requestNo) ?? "Request";
  const matter = stringValue(payload.matter) ?? requestNo;
  const customerName = stringValue(payload.customerName);
  const context = customerName ? `${customerName} · ${matter}` : `${matter} · ${requestNo}`;

  if (row.type === "pm_request_submitted") {
    return item(row, "New request submitted", context, requestNo, payload);
  }
  if (row.type === "pm_quote_confirmed") {
    const version = numberValue(payload.quoteVersion);
    return item(row, "Quotation confirmed", context, version ? `Quotation v${version}` : requestNo, payload);
  }
  const count = numberValue(payload.fileCount) ?? 0;
  return item(row, "Signed documents received", context, `${count} ${count === 1 ? "file" : "files"}`, payload);
}

function item(
  row: PmNotificationRow,
  title: string,
  detail: string,
  meta: string,
  payload: Record<string, unknown>,
): PmNotificationItem {
  return {
    id: row.id,
    type: row.type as PmNotificationType,
    title,
    detail,
    meta,
    href: safePmHref(payload.href, payload.requestId),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function safePmHref(value: unknown, requestId: unknown) {
  if (typeof value === "string" && /^\/pm\/[0-9a-f-]+(?:[?#].*)?$/i.test(value)) return value;
  if (typeof requestId === "string" && /^[0-9a-f-]+$/i.test(requestId)) return `/pm/${requestId}`;
  return "/pm";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
