import { Suspense } from "react";

import { RequesterHeader } from "@/features/requester/components/requester-header";
import { RequesterNotificationList } from "@/features/requester/components/requester-notification-list";
import { getRequesterNotifications } from "@/features/requester/notification-queries";

export default function RequesterMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading messages...</p>}>
      <MessagesContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MessagesContent({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; page?: string }>;
}) {
  const params = await searchParams;
  const unreadOnly = params.view === "unread";
  const requestedPage = Number(params.page ?? "1");
  const messages = await getRequesterNotifications({
    unreadOnly,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden">
      <RequesterHeader
        title="Messages"
        description="Review signature requests, completed deliveries, and approaching deadlines."
        showEyebrow={false}
      />
      <RequesterNotificationList
        items={messages.items}
        unreadOnly={unreadOnly}
        unreadCount={messages.unreadCount ?? 0}
        page={messages.page}
        totalPages={messages.totalPages}
      />
    </div>
  );
}
