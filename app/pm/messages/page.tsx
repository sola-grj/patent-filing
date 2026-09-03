import { Suspense } from "react";

import { PmHeader } from "@/features/pm/components/pm-header";
import { PmNotificationList } from "@/features/pm/components/pm-notification-list";
import { getPmNotifications } from "@/features/pm/notification-queries";
import { PmAccessDenied } from "@/features/pm/components/pm-access-denied";

export default function PmMessagesPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  return <Suspense fallback={<p className="text-sm text-muted-foreground">Loading messages...</p>}><MessagesContent searchParams={searchParams} /></Suspense>;
}

async function MessagesContent({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const params = await searchParams;
  const unreadOnly = params.view === "unread";
  const requestedPage = Number(params.page ?? "1");
  const messages = await getPmNotifications({ unreadOnly, page: Number.isFinite(requestedPage) ? requestedPage : 1 });
  if (messages.denied) return <PmAccessDenied />;
  return <div className="flex h-full min-h-0 flex-col gap-6 overflow-hidden"><PmHeader title="Messages" description="Review submitted requests, quotation confirmations, and returned signed documents." showEyebrow={false} /><PmNotificationList items={messages.items} unreadOnly={unreadOnly} unreadCount={messages.unreadCount} page={messages.page} totalPages={messages.totalPages} /></div>;
}
