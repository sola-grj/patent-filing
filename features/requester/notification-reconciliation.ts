import "server-only";

import { createServiceClient } from "@/lib/supabase/server";

import type { RequestDeadlineSource } from "./deadlines";
import {
  buildCompletedNotificationSeed,
  buildDeadlineNotificationSeeds,
  type CompletedRequestSource,
  type NotificationSeed,
} from "./notifications";

const requestSelect = "id, requester_id, request_no, title, requester_status, workflow_stage, updated_at, request_patents(patent_number), orders(completed_at, updated_at, translation_tasks(task_deliverables(status, created_at)))";
const deadlineSelect = "id, requester_id, request_no, channel_code, submitted_at, workflow_stage, requester_status, translation_requirements(service_types, epv_type_code, ep_service_type_code, jurisdiction_codes, pct_chapter_code), request_patents(patent_number, application_no, publication_no, first_priority_date, international_filing_date, grant_publication_date, rule_71_3_communication_date)";

export async function ensureCompletedRequestNotification(requestId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("translation_requests")
    .select(requestSelect)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const seed = buildCompletedNotificationSeed(data as CompletedRequestSource);
  if (!seed) return false;
  await upsertNotificationSeeds(service, [seed]);
  return true;
}

export async function reconcileRequesterNotifications(
  today = new Date().toISOString().slice(0, 10),
) {
  const service = createServiceClient();
  const [completedResult, deadlineResult] = await Promise.all([
    service
      .from("translation_requests")
      .select(requestSelect)
      .eq("requester_status", "completed")
      .eq("workflow_stage", "completed"),
    service
      .from("translation_requests")
      .select(deadlineSelect)
      .not("submitted_at", "is", null),
  ]);
  if (completedResult.error) throw new Error(completedResult.error.message);
  if (deadlineResult.error) throw new Error(deadlineResult.error.message);

  const completedSeeds = (completedResult.data ?? [])
    .map((request) => buildCompletedNotificationSeed(request as CompletedRequestSource))
    .filter((seed): seed is NotificationSeed => Boolean(seed));
  const deadlineSeeds = buildDeadlineNotificationSeeds(
    (deadlineResult.data ?? []) as Array<RequestDeadlineSource & { requester_id: string }>,
    today,
  );
  await upsertNotificationSeeds(service, [...completedSeeds, ...deadlineSeeds]);

  const activeDeadlineKeys = new Set(deadlineSeeds.map((seed) => seed.dedupe_key));
  const { data: unreadDeadlines, error: unreadError } = await service
    .from("notifications")
    .select("id, dedupe_key")
    .eq("type", "request_deadline_approaching")
    .is("read_at", null);
  if (unreadError) throw new Error(unreadError.message);
  const staleIds = (unreadDeadlines ?? [])
    .filter((notification) => !activeDeadlineKeys.has(notification.dedupe_key))
    .map((notification) => notification.id);
  if (staleIds.length) {
    const { error: staleError } = await service
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .in("id", staleIds);
    if (staleError) throw new Error(staleError.message);
  }

  return {
    completed: completedSeeds.length,
    deadlines: deadlineSeeds.length,
    staleMarkedRead: staleIds.length,
  };
}

async function upsertNotificationSeeds(
  service: ReturnType<typeof createServiceClient>,
  seeds: NotificationSeed[],
) {
  if (!seeds.length) return;
  const { error } = await service
    .from("notifications")
    .upsert(seeds, { onConflict: "recipient_id,dedupe_key" });
  if (error) throw new Error(error.message);
}
