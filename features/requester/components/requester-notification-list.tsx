import Link from "next/link";
import { CalendarClock, CheckCheck, Download, FileSignature, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/ui/pagination";
import {
  markAllRequesterNotificationsRead,
  openRequesterNotification,
} from "@/features/requester/actions/notifications";
import type { RequesterNotificationItem } from "@/features/requester/notifications";
import { cn } from "@/lib/utils";

export function RequesterNotificationList({
  items,
  unreadOnly,
  unreadCount,
  page,
  totalPages,
}: {
  items: RequesterNotificationItem[];
  unreadOnly: boolean;
  unreadCount: number;
  page: number;
  totalPages: number;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex shrink-0 flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <MessageTab href="/requester/messages" active={!unreadOnly}>
            All
          </MessageTab>
          <MessageTab href="/requester/messages?view=unread" active={unreadOnly}>
            Unread
            {unreadCount ? (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-5 text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </MessageTab>
        </div>
        <form action={markAllRequesterNotificationsRead}>
          <Button type="submit" variant="outline" size="sm" disabled={!unreadCount}>
            <CheckCheck className="size-4" />
            Mark all as read
          </Button>
        </form>
      </div>

      {items.length ? (
        <div className="hide-scrollbar min-h-0 flex-1 divide-y overflow-y-auto">
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-16 text-center">
          <div>
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Inbox className="size-5" />
            </span>
            <p className="mt-4 font-medium">
              {unreadOnly ? "No unread messages" : "No messages yet"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Signature requests, completed deliveries, and approaching deadlines will appear here.
            </p>
          </div>
        </div>
      )}

      <PaginationNav
        currentPage={page}
        totalPages={totalPages}
        buildHref={(nextPage) => buildPageHref(nextPage, unreadOnly)}
        className="shrink-0 border-t px-5 py-4"
      />
    </section>
  );
}

function MessageTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function NotificationRow({ item }: { item: RequesterNotificationItem }) {
  return (
    <form action={openRequesterNotification}>
      <input type="hidden" name="notificationId" value={item.id} />
      <button
        type="submit"
        className={cn(
          "grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center",
          !item.readAt && "bg-brand-soft/35",
        )}
      >
        <span className={cn(
          "flex size-11 items-center justify-center rounded-full border",
          notificationTone(item.type),
        )}>
          <NotificationIcon type={item.type} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
            {!item.readAt ? (
              <span className="size-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />
            ) : null}
          </span>
          <span className="mt-1 block truncate text-sm text-muted-foreground">{item.detail}</span>
          <span className="mt-1 block text-xs text-muted-foreground sm:hidden">{item.meta}</span>
        </span>
        <span className="hidden text-right sm:block">
          <span className="block text-xs font-medium text-muted-foreground">{item.meta}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{formatMessageTime(item.createdAt)}</span>
        </span>
      </button>
    </form>
  );
}

function NotificationIcon({ type }: { type: RequesterNotificationItem["type"] }) {
  if (type === "filing_signature_required") return <FileSignature className="size-5" />;
  if (type === "request_completed") return <Download className="size-5" />;
  return <CalendarClock className="size-5" />;
}

function notificationTone(type: RequesterNotificationItem["type"]) {
  if (type === "request_completed") return "border-emerald-200 bg-emerald-50 text-emerald-600";
  return "border-amber-200 bg-amber-50 text-amber-600";
}

function buildPageHref(page: number, unreadOnly: boolean) {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("view", "unread");
  params.set("page", String(page));
  return `/requester/messages?${params}`;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
