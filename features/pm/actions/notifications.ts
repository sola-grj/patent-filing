"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requiredString } from "@/lib/validators/requester";
import { requirePmContext } from "../server-utils";
import { pmNotificationTypes, toPmNotificationItem, type PmNotificationRow } from "../notifications";

export async function openPmNotification(formData: FormData) {
  const context = await requirePmContext();
  if (context.denied) redirect("/pm");
  const notificationId = requiredString(formData.get("notificationId"), "Notification");
  const { data, error } = await context.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("recipient_id", context.userId)
    .in("type", [...pmNotificationTypes])
    .select("id, type, payload, read_at, created_at")
    .single();
  if (error) throw new Error(error.message);

  const item = toPmNotificationItem(data as PmNotificationRow);
  if (!item) throw new Error("This notification is not available.");
  revalidatePath("/pm", "layout");
  redirect(item.href);
}

export async function markAllPmNotificationsRead() {
  const context = await requirePmContext();
  if (context.denied) return;
  const { error } = await context.supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", context.userId)
    .in("type", [...pmNotificationTypes])
    .is("read_at", null);
  if (error) throw new Error(error.message);
  revalidatePath("/pm", "layout");
  revalidatePath("/pm/messages");
}
