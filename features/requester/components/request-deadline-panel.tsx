import { CalendarClock } from "lucide-react";

import type { DashboardDeadlineItem } from "@/features/requester/deadlines";
import { formatDate } from "@/features/requester/format";

export function RequestDeadlinePanel({
  items,
  pendingMessage,
}: {
  items: DashboardDeadlineItem[];
  pendingMessage?: string | null;
}) {
  return (
    <section
      id="request-deadline"
      aria-label="Legal deadlines"
      className="rounded-lg border border-border/70 bg-muted/20 p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <CalendarClock className="size-4 text-brand-soft-foreground" />
        </span>
        <div>
          <h3 className="text-sm font-semibold">Legal deadlines</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Calculated from official patent dates and selected services
          </p>
        </div>
      </div>
      {items.length ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {items.map((item) => (
          <div
            key={item.id}
            className={item.overdue
              ? "min-w-[14rem] flex-1 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3"
              : "min-w-[14rem] flex-1 rounded-md border bg-background px-3 py-3"}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={item.overdue
                ? "font-semibold text-destructive"
                : "font-semibold text-foreground"}
              >
                {formatDate(item.dueOn)}
              </p>
              {item.overdue ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                  Overdue
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm font-medium">{item.title}</p>
            {item.jurisdictionCodes.length ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Jurisdictions · {item.jurisdictionCodes.join(", ")}
              </p>
            ) : null}
          </div>
          ))}
        </div>
      ) : pendingMessage ? (
        <div className="mt-4 rounded-md border border-dashed bg-background px-3 py-3">
          <p className="text-sm font-medium">Deadline pending</p>
          <p className="mt-1 text-xs text-muted-foreground">{pendingMessage}</p>
        </div>
      ) : null}
    </section>
  );
}
