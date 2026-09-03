import Link from "next/link";
import { BellRing, CheckCheck, CircleCheck, FileSignature, Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PaginationNav } from "@/components/ui/pagination";
import { markAllPmNotificationsRead, openPmNotification } from "@/features/pm/actions/notifications";
import type { PmNotificationItem } from "@/features/pm/notifications";
import { cn } from "@/lib/utils";

export function PmNotificationList({ items, unreadOnly, unreadCount, page, totalPages }: {
  items: PmNotificationItem[];
  unreadOnly: boolean;
  unreadCount: number;
  page: number;
  totalPages: number;
}) {
  return <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
    <div className="flex shrink-0 flex-col gap-4 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Tab href="/pm/messages" active={!unreadOnly}>All</Tab>
        <Tab href="/pm/messages?view=unread" active={unreadOnly}>Unread {unreadCount ? <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold leading-5 text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}</Tab>
      </div>
      <form action={markAllPmNotificationsRead}><Button type="submit" variant="outline" size="sm" disabled={!unreadCount}><CheckCheck className="size-4" />Mark all as read</Button></form>
    </div>
    {items.length ? <div className="hide-scrollbar min-h-0 flex-1 divide-y overflow-y-auto">{items.map((item) => <Row key={item.id} item={item} />)}</div> : <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-16 text-center"><div><span className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Inbox className="size-5" /></span><p className="mt-4 font-medium">{unreadOnly ? "No unread messages" : "No messages yet"}</p><p className="mt-1 text-sm text-muted-foreground">Customer requests, quotation confirmations, and signed documents will appear here.</p></div></div>}
    <PaginationNav currentPage={page} totalPages={totalPages} buildHref={(nextPage) => buildHref(nextPage, unreadOnly)} className="shrink-0 border-t px-5 py-4" />
  </section>;
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-md px-3 text-sm font-medium transition-colors", active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{children}</Link>;
}

function Row({ item }: { item: PmNotificationItem }) {
  return <form action={openPmNotification}><input type="hidden" name="notificationId" value={item.id} /><button type="submit" className={cn("grid w-full gap-4 px-5 py-5 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-center", !item.readAt && "bg-brand-soft/35")}><span className={cn("flex size-11 items-center justify-center rounded-full border", tone(item.type))}>{icon(item.type)}</span><span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-semibold text-foreground">{item.title}</span>{!item.readAt ? <span className="size-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" /> : null}</span><span className="mt-1 block truncate text-sm text-muted-foreground">{item.detail}</span><span className="mt-1 block text-xs text-muted-foreground sm:hidden">{item.meta}</span></span><span className="hidden text-right sm:block"><span className="block text-xs font-medium text-muted-foreground">{item.meta}</span><span className="mt-1 block text-xs text-muted-foreground">{formatTime(item.createdAt)}</span></span></button></form>;
}

function icon(type: PmNotificationItem["type"]) { if (type === "pm_signed_documents_received") return <FileSignature className="size-5" />; if (type === "pm_quote_confirmed") return <CircleCheck className="size-5" />; return <BellRing className="size-5" />; }
function tone(type: PmNotificationItem["type"]) { if (type === "pm_signed_documents_received") return "border-violet-200 bg-violet-50 text-violet-600"; if (type === "pm_quote_confirmed") return "border-emerald-200 bg-emerald-50 text-emerald-600"; return "border-sky-200 bg-sky-50 text-sky-600"; }
function buildHref(page: number, unreadOnly: boolean) { const params = new URLSearchParams(); if (unreadOnly) params.set("view", "unread"); params.set("page", String(page)); return `/pm/messages?${params}`; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date); }
