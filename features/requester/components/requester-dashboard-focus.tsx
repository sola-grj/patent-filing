import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CircleAlert,
  Download,
  FileSignature,
  ShieldCheck,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import type { DashboardAttentionItem } from "@/features/requester/dashboard-attention";

const deadlineItems = [
  {
    date: "Jul 30",
    title: "PCT 30-month deadline",
    detail: "WO/2024/044310",
    service: "National Phase Entry",
  },
  {
    date: "Aug 12",
    title: "EP validation deadline",
    detail: "EP4686390A2",
    service: "EP Validation",
  },
  {
    date: "Sep 05",
    title: "12-month priority deadline",
    detail: "REQ-20260725-000054",
    service: "Paris Convention",
  },
] as const;

export function DashboardFocusGrid({
  attentionItems,
}: {
  attentionItems: DashboardAttentionItem[];
}) {
  return (
    <section className="grid min-h-0 grid-rows-2 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,2fr)] xl:grid-rows-1">
      <AttentionPanel items={attentionItems} />
      <DeadlinesPanel />
    </section>
  );
}

function AttentionPanel({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl shadow-sm">
      <div className="flex shrink-0 items-center gap-2 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">Needs your attention</h2>
        <span
          className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
            items.length
              ? "bg-red-500 text-white"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {items.length}
        </span>
      </div>
      {items.length ? (
        <div className="hide-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`grid min-h-[64px] items-center gap-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] ${
                items.length === 1 ? "basis-1/3 flex-none" : "flex-1"
              }`}
            >
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full border dashboard-tone-${item.tone}`}
                >
                  <AttentionIcon kind={item.kind} />
                </span>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <p className="truncate text-sm font-semibold">
                      {item.title}
                    </p>
                    {item.kind === "urgent" ? (
                      <span
                        aria-label="Urgent request"
                        title="Urgent"
                        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-950/50 dark:text-red-300"
                      >
                        <CircleAlert className="size-3.5" />
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </div>
              <AttentionAction item={item} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center">
          <div>
            <p className="font-medium">You&apos;re all caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Signature requests, urgent matters, and ready downloads will appear here.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function AttentionIcon({ kind }: { kind: DashboardAttentionItem["kind"] }) {
  if (kind === "download") {
    return <Download className="size-5" />;
  }
  if (kind === "signature") {
    return <FileSignature className="size-5" />;
  }
  return <CalendarDays className="size-5" />;
}

function AttentionAction({ item }: { item: DashboardAttentionItem }) {
  const className =
    "flex items-center justify-self-start gap-1.5 rounded-md px-1.5 py-2 text-xs font-medium text-brand-soft-foreground transition-colors hover:bg-brand-soft sm:justify-self-end";
  const content = (
    <>
      {item.action}
      {item.kind === "download" ? (
        <Download className="size-3.5" />
      ) : (
        <ChevronRight className="size-3.5" />
      )}
    </>
  );

  return item.kind === "download" ? (
    <a href={item.href} className={className}>
      {content}
    </a>
  ) : (
    <Link href={item.href} className={className}>
      {content}
    </Link>
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
        <CalendarDays className="size-5 text-muted-foreground" />
      </div>
      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col divide-y overflow-y-auto px-5">
        {deadlineItems.map((item) => (
          <Link
            key={`${item.date}-${item.title}`}
            href="/requester/requests"
            className="grid min-h-[64px] flex-1 items-center gap-3 py-3 text-sm sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]"
          >
            <span className="font-semibold text-foreground">{item.date}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.detail}
              </span>
            </span>
            <span
              className="hidden rounded-md border bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground sm:inline-flex"
            >
              {item.service}
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t px-5 py-2.5 text-xs text-brand-soft-foreground">
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
