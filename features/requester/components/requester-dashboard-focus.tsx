import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Download,
  FileText,
  ShieldCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";

const attentionItems = [
  {
    title: "National phase filing not started",
    detail: "WO/2024/044310 · Due in 6 days",
    badge: "Urgent",
    action: "Start request",
    href: "/requester/requests/new",
    icon: CalendarDays,
    tone: "red",
  },
  {
    title: "Complete your request",
    detail: "REQ-20260726-000055 · Saved at Service details",
    badge: "Draft",
    action: "Resume request",
    href: "/requester/requests/new",
    icon: FileText,
    tone: "amber",
  },
  {
    title: "Delivery ready to download",
    detail: "EP4686390A2 · Completed Jul 26",
    badge: "Complete",
    action: "View order",
    href: "/requester/orders",
    icon: Download,
    tone: "green",
  },
] as const;

const deadlineItems = [
  {
    date: "Jul 30",
    title: "PCT 30-month deadline",
    detail: "WO/2024/044310",
    service: "National Phase Entry",
    tone: "blue",
  },
  {
    date: "Aug 12",
    title: "EP validation deadline",
    detail: "EP4686390A2",
    service: "EP Validation",
    tone: "violet",
  },
  {
    date: "Sep 05",
    title: "12-month priority deadline",
    detail: "REQ-20260725-000054",
    service: "Paris Convention",
    tone: "green",
  },
] as const;

export function DashboardFocusGrid() {
  return (
    <section className="grid min-h-0 grid-rows-2 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] xl:grid-rows-1">
      <AttentionPanel />
      <DeadlinesPanel />
    </section>
  );
}

function AttentionPanel() {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Needs your attention</h2>
        <span className="flex size-6 items-center justify-center rounded-full bg-red-500 text-xs font-semibold text-white">
          3
        </span>
      </div>
      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
        {attentionItems.map((item) => (
          <div
            key={item.title}
            className="grid min-h-[64px] flex-1 items-center gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]"
          >
            <div className="flex min-w-0 items-center gap-4">
              <span
                className={`flex size-11 shrink-0 items-center justify-center rounded-full border dashboard-tone-${item.tone}`}
              >
                <item.icon className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.detail}
                </p>
              </div>
            </div>
            <span
              className={`justify-self-start rounded-md border px-3 py-1 text-center text-xs sm:w-full dashboard-badge-${item.tone}`}
            >
              {item.badge}
            </span>
            <Link
              href={item.href}
              className="flex h-9 items-center justify-between rounded-md border border-emerald-900/55 px-3 text-xs font-medium text-emerald-950 transition-colors hover:bg-emerald-50"
            >
              {item.action}
              <ChevronRight className="size-4" />
            </Link>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DeadlinesPanel() {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="flex shrink-0 items-start justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">Upcoming deadlines</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Calculated from official patent data and selected services
          </p>
        </div>
        <CalendarDays className="size-5 text-slate-500" />
      </div>
      <div className="hide-scrollbar min-h-0 flex-1 divide-y overflow-y-auto px-5">
        {deadlineItems.map((item) => (
          <Link
            key={`${item.date}-${item.title}`}
            href="/requester/requests"
            className="grid items-center gap-3 py-3 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]"
          >
            <span className="font-semibold text-red-500">{item.date}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.detail}
              </span>
            </span>
            <span
              className={`hidden rounded-md border px-2 py-1 text-[11px] sm:inline-flex dashboard-badge-${item.tone}`}
            >
              {item.service}
            </span>
            <ChevronRight className="size-4 text-slate-500" />
          </Link>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t px-5 py-2.5 text-xs text-emerald-950">
        <Link
          href="/requester/requests"
          className="flex items-center gap-1 font-medium"
        >
          View deadline details
          <ArrowRight className="size-3.5" />
        </Link>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ShieldCheck className="size-4" />
          Data from EPO · WIPO
        </span>
      </div>
    </Card>
  );
}
