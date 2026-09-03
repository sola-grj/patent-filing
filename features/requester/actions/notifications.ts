"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requiredString } from "@/lib/validators/requester";
import { getAuthenticatedUser } from "@/features/requester/server-utils";
import {
  requesterNotificationTypes,
  toRequesterNotificationItem,
  type RequesterNotificationRow,
} from "@/features/requester/notifications";

export async function openRequesterNotification(formData: FormData) {
  const { supabase } = await getAuthenticatedUser();
  const notificationId = requiredString(formData.get("notificationId"), "Notification");
  const { data, error } = await supabase.rpc("open_requester_notification", {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(error.message);

  const item = toRequesterNotificationItem(data as RequesterNotificationRow);
  if (!item) throw new Error("This notification is not available.");

  revalidatePath("/requester", "layout");
  redirect(buildRequesterNotificationHref(item.href, item.type));
}

export async function markAllRequesterNotificationsRead() {
  const { supabase, userId } = await getAuthenticatedUser();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .in("type", [...requesterNotificationTypes])
    .is("read_at", null);
  if (error) throw new Error(error.message);

  revalidatePath("/requester", "layout");
  revalidatePath("/requester/messages");
}

function buildRequesterNotificationHref(
  href: string,
  type: RequesterNotificationRow["type"],
) {
  const url = new URL(href, "http://localhost");
  url.searchParams.set("source", "message");
  if (type === "filing_signature_required") {
    url.searchParams.set("tab", "signatures");
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
