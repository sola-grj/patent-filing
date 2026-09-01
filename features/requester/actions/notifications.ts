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
  const { supabase, userId } = await getAuthenticatedUser();
  const notificationId = requiredString(formData.get("notificationId"), "Notification");
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, payload, read_at, created_at")
    .eq("id", notificationId)
    .eq("recipient_id", userId)
    .in("type", [...requesterNotificationTypes])
    .single();
  if (error) throw new Error(error.message);

  const item = toRequesterNotificationItem(data as RequesterNotificationRow);
  if (!item) throw new Error("This notification is not available.");

  if (!item.readAt) {
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", userId)
      .is("read_at", null);
    if (updateError) throw new Error(updateError.message);
  }

  revalidatePath("/requester", "layout");
  redirect(item.href);
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
