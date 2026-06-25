import { MessageSquareMore, Scale, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatDate,
  titleCaseStatus,
} from "@/features/requester/format";
import type { RequesterQuoteHistoryEntry } from "@/features/requester/queries";

type QuoteNegotiationHistoryProps = {
  cardClassName?: string;
  contentClassName?: string;
  currency?: string | null;
  headerClassName?: string;
  items: RequesterQuoteHistoryEntry[];
};

export function QuoteNegotiationHistory({
  cardClassName,
  contentClassName,
  currency,
  headerClassName,
  items,
}: QuoteNegotiationHistoryProps) {
  if (!items.length) {
    return null;
  }

  return (
    <Card className={cardClassName}>
      <CardHeader
        className={cn(
          "flex flex-row items-start justify-between gap-3 space-y-0",
          headerClassName,
        )}
      >
        <div className="space-y-1">
          <CardTitle>Negotiation history</CardTitle>
          <p className="text-sm text-muted-foreground">
            Review each negotiation round and PM feedback on this quote.
          </p>
        </div>
        <Badge variant="secondary">{items.length} rounds</Badge>
      </CardHeader>
      <CardContent className={contentClassName}>
        <div className="space-y-4">
          {items.map((item, index) => (
            <article
              key={item.id}
              className="rounded-xl border border-border/70 bg-muted/20 p-4"
            >
              <div className="flex flex-col gap-3 border-b border-border/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Scale className="size-4 text-amber-600" />
                      <span>Round {index + 1}</span>
                    </div>
                    {item.isLatest ? (
                      <Badge variant="secondary">Latest</Badge>
                    ) : null}
                    <Badge variant="outline">
                      {titleCaseStatus(item.status)}
                    </Badge>
                    <Badge variant="outline">
                      PM {titleCaseStatus(item.pmDecision)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Submitted {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                  <MetricItem
                    label="Expected amount"
                    value={
                      item.expectedAmount != null
                        ? formatCurrency(item.expectedAmount, currency ?? "USD")
                        : "-"
                    }
                  />
                  <MetricItem
                    label="Expected delivery"
                    value={formatDate(item.expectedDeliveryAt)}
                  />
                  <MetricItem
                    label="Response quote"
                    value={item.responseQuoteId ? "Available" : "-"}
                  />
                </div>
              </div>

              <div className="grid gap-4 pt-4 ">
                <section className="space-y-3">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareMore className="size-4 text-muted-foreground" />
                      <span>Message log</span>
                    </div>
                    {item.messages.length ? (
                      <div className="space-y-3">
                        {item.messages.map((message) => (
                          <div
                            key={message.id}
                            className="rounded-lg border border-border/70 bg-background px-4 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium">
                                {message.authorLabel}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(message.createdAt)}
                              </p>
                            </div>
                            <div className="mt-3 space-y-2 text-sm">
                              <KeyValueRow
                                label="Quote amount"
                                value={
                                  message.expectedAmount != null
                                    ? formatCurrency(
                                        message.expectedAmount,
                                        currency ?? "USD",
                                      )
                                    : "-"
                                }
                              />
                              <KeyValueRow
                                label="Delivery date"
                                value={formatDate(message.expectedDeliveryAt)}
                              />
                              <KeyValueRow
                                label="Notes"
                                value={
                                  message.adjustmentNotes ?? message.body ?? "-"
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        No exchange messages have been recorded for this round.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            </article>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-28 rounded-lg border border-border/70 bg-background px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p className="text-sm leading-6 text-foreground">{value}</p>
    </div>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
      <span className="font-medium text-foreground">{label}：</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
