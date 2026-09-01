import type { createClient } from "@/lib/supabase/server";

import { getAuthenticatedUser, getRequesterOrganization } from "./server-utils";
import {
  requesterNotificationTypes,
  toRequesterNotificationItem,
  type RequesterNotificationRow,
} from "./notifications";

const PAGE_SIZE = 20;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function getRequesterNotifications(input: {
  unreadOnly?: boolean;
  page?: number;
}) {
  const { supabase, userId, organization } = await getRequesterOrganization();
  const page = Math.max(1, input.page ?? 1);

  if (!organization) {
    return { organization: null, items: [], page: 1, totalPages: 0, totalCount: 0 };
  }

  let query = supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at", { count: "exact" })
    .eq("recipient_id", userId)
    .in("type", [...requesterNotificationTypes])
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (input.unreadOnly) {
    query = query.is("read_at", null);
  }

  const [listResult, unreadResult] = await Promise.all([
    query,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userId)
      .in("type", [...requesterNotificationTypes])
      .is("read_at", null),
  ]);
  const { data, error, count } = listResult;
  if (error) throw new Error(error.message);
  if (unreadResult.error) throw new Error(unreadResult.error.message);
  const totalCount = count ?? 0;
  const totalPages = totalCount ? Math.ceil(totalCount / PAGE_SIZE) : 0;

  return {
    organization,
    items: ((data ?? []) as RequesterNotificationRow[])
      .map(toRequesterNotificationItem)
      .filter((item) => item !== null),
    page: Math.min(page, Math.max(1, totalPages)),
    totalPages,
    totalCount,
    unreadCount: unreadResult.count ?? 0,
  };
}

export async function getRequesterUnreadNotificationCount() {
  const { supabase, userId } = await getAuthenticatedUser();
  return countRequesterUnreadNotifications(supabase, userId);
}

export async function countRequesterUnreadNotifications(
  supabase: SupabaseClient,
  userId: string,
) {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .in("type", [...requesterNotificationTypes])
    .is("read_at", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
