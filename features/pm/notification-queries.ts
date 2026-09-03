import { requirePmContext } from "./server-utils";
import { pmNotificationTypes, toPmNotificationItem, type PmNotificationRow } from "./notifications";

const PAGE_SIZE = 20;

export async function getPmNotifications(input: { unreadOnly?: boolean; page?: number }) {
  const context = await requirePmContext();
  if (context.denied) return { denied: true, items: [], page: 1, totalPages: 0, totalCount: 0, unreadCount: 0 };

  const page = Math.max(1, input.page ?? 1);
  let query = context.supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at", { count: "exact" })
    .eq("recipient_id", context.userId)
    .in("type", [...pmNotificationTypes])
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (input.unreadOnly) query = query.is("read_at", null);

  const [{ data, error, count }, unread] = await Promise.all([
    query,
    context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", context.userId)
      .in("type", [...pmNotificationTypes])
      .is("read_at", null),
  ]);
  if (error) throw new Error(error.message);
  if (unread.error) throw new Error(unread.error.message);

  const totalCount = count ?? 0;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 0;
  return {
    denied: false,
    items: ((data ?? []) as PmNotificationRow[]).map(toPmNotificationItem).filter((item) => item !== null),
    page: Math.min(page, Math.max(1, totalPages)),
    totalPages,
    totalCount,
    unreadCount: unread.count ?? 0,
  };
}
