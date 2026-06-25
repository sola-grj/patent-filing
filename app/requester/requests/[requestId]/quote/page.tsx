import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CircleEllipsis } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteNegotiationHistory } from "@/features/requester/components/quote-negotiation-history";
import { QuoteActions } from "@/features/requester/components/quote-actions";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate } from "@/features/requester/format";
import type { RequesterQuoteHistoryEntry } from "@/features/requester/queries";
import { RequesterStatusBadge } from "@/features/requester/requester-status";
import { getRequesterQuote } from "@/features/requester/queries";

type QuoteItem = {
  id: string;
  label: string;
  amount: number | string;
  description?: string | null;
};

type Quote = {
  id: string;
  status?: string | null;
  total_amount?: number | string | null;
  currency?: string | null;
  estimated_delivery_at?: string | null;
  valid_until?: string | null;
  quote_items?: QuoteItem[] | null;
};

type NegotiationPoint = {
  amount: number | string | null;
  deliveryAt: string | null;
  source: "pm" | "requester" | "quote";
};

export default function QuotePage({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading quote...</p>}>
      <QuoteContent params={params} />
    </Suspense>
  );
}

async function QuoteContent({
  params,
}: {
  params: Promise<{ requestId: string }>;
}) {
  const { requestId } = await params;
  const {
    request,
    quote,
    latestNegotiation,
    isWaitingForPmFeedback,
    isPmInitiatedNegotiation,
    negotiationHistory,
  } = await getRequesterQuote(requestId);

  if (!request) notFound();
  const items = (quote?.quote_items ?? []) as QuoteItem[];
  const isAcceptedQuote = quote?.status === "accepted";
  const isNegotiationActive = request.requester_status === "negotiation";
  const shouldShowLifecycleStatus =
    request.requester_status === "negotiation" ||
    request.requester_status === "in_progress";
  const primaryPoint = isNegotiationActive
    ? getLatestNegotiationPoint(latestNegotiation, quote)
    : null;
  const previousPmPoint = isNegotiationActive
    ? getPreviousPmQuotePoint(negotiationHistory, primaryPoint)
    : null;
  const primaryAmount =
    primaryPoint?.amount != null
      ? primaryPoint.amount
      : quote?.total_amount;
  const primaryDeliveryAt =
    primaryPoint?.deliveryAt
      ? primaryPoint.deliveryAt
      : quote?.estimated_delivery_at;
  const showNegotiatedComparison =
    isNegotiationActive &&
    Boolean(primaryPoint) &&
    Boolean(previousPmPoint);
  const comparisonAmount = previousPmPoint?.amount ?? quote?.total_amount ?? null;
  const comparisonCurrency = quote?.currency ?? "USD";
  const comparisonDeliveryAt = previousPmPoint?.deliveryAt ?? quote?.estimated_delivery_at ?? null;

  return (
    <div className="space-y-8">
      <RequesterHeader title="Quote review" description={request.request_no} />
      {!quote ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">No quote has been generated yet.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader><CardTitle>Quote details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    {showNegotiatedComparison ? (
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Negotiated quote
                      </p>
                    ) : null}
                    <p className="text-4xl font-semibold">
                      {formatCurrency(primaryAmount, quote.currency ?? "USD")}
                    </p>
                  </div>
                  {showNegotiatedComparison ? (
                    <div className="min-w-[220px] rounded-xl border bg-muted/20 px-4 py-3 md:text-right">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Previous quote
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-muted-foreground">
                        {formatCurrency(comparisonAmount, comparisonCurrency)}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Delivery {formatDate(comparisonDeliveryAt)}
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-3 text-sm md:grid-cols-3 md:items-center">
                  <div className="flex items-center gap-2 md:justify-self-start">
                    <span className="font-semibold text-foreground">Status</span>
                    {shouldShowLifecycleStatus ? (
                      <RequesterStatusBadge size="compact" status={request.requester_status} />
                    ) : (
                      <StatusBadge status={quote.status} />
                    )}
                  </div>
                  <div className="flex items-center gap-2 md:justify-self-center">
                    <span className="font-semibold text-foreground">Delivery</span>
                    <span>{formatDate(primaryDeliveryAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 md:justify-self-end">
                    <span className="font-semibold text-foreground">Valid until</span>
                    <span>{formatDate(quote.valid_until)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <div key={item.id} className="flex justify-between rounded-md border p-3 text-sm">
                      <span>{item.label}<span className="block text-muted-foreground">{item.description}</span></span>
                      <span>{formatCurrency(item.amount, quote.currency ?? "USD")}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
              <CardContent>
                {isWaitingForPmFeedback ? (
                  <div className="rounded-xl border border-dashed px-4 py-5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1.5">
                        <CircleEllipsis className="size-3.5" />
                        Pending
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium">Waiting for PM feedback</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Your negotiation request has been sent. Actions will be available again after the PM responds.
                    </p>
                  </div>
                ) : isPmInitiatedNegotiation ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-dashed px-4 py-5">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1.5">
                          <CircleEllipsis className="size-3.5" />
                          Negotiating
                        </Badge>
                      </div>
                      <p className="mt-3 text-sm font-medium">PM requested quote adjustments</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Review the latest negotiation request and choose to accept, reject, or continue negotiating from this page.
                      </p>
                    </div>
                    <QuoteActions
                      acceptLabel="Accept"
                      acceptMode="pm-negotiation"
                      negotiationId={latestNegotiation?.id}
                      requestId={request.id}
                      quoteId={quote.id}
                    />
                  </div>
                ) : isAcceptedQuote ? (
                  <div className="rounded-xl border border-dashed px-4 py-5">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {request.requester_status === "in_progress" ? "In progress" : "Quote accepted"}
                      </Badge>
                    </div>
                    <p className="mt-3 text-sm font-medium">
                      {request.requester_status === "in_progress"
                        ? "Negotiated quote accepted"
                        : "Quote accepted"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {request.requester_status === "in_progress"
                        ? "PM accepted the negotiated terms. The request is now in progress."
                        : "This quote has been accepted. PM can continue with task assignment and delivery."}
                    </p>
                  </div>
                ) : (
                  <QuoteActions requestId={request.id} quoteId={quote.id} />
                )}
              </CardContent>
            </Card>
          </div>
          <QuoteNegotiationHistory
            currency={quote.currency}
            items={negotiationHistory}
          />
        </div>
      )}
    </div>
  );
}

function getLatestNegotiationPoint(
  latestNegotiation: RequesterQuoteHistoryEntry | null,
  quote: Quote | null,
): NegotiationPoint | null {
  if (!latestNegotiation) {
    return null;
  }

  const latestMessageWithQuote = [...latestNegotiation.messages]
    .reverse()
    .find((message) => message.expectedAmount != null || message.expectedDeliveryAt);

  if (latestMessageWithQuote) {
    return {
      amount: latestMessageWithQuote.expectedAmount ?? null,
      deliveryAt: latestMessageWithQuote.expectedDeliveryAt ?? null,
      source: latestMessageWithQuote.authorLabel === "Requester" ? "requester" : "pm",
    };
  }

  if (latestNegotiation.expectedAmount != null || latestNegotiation.expectedDeliveryAt) {
    return {
      amount: latestNegotiation.expectedAmount ?? null,
      deliveryAt: latestNegotiation.expectedDeliveryAt ?? null,
      source: "requester",
    };
  }

  if (!quote) {
    return null;
  }

  return {
    amount: quote.total_amount ?? null,
    deliveryAt: quote.estimated_delivery_at ?? null,
    source: "quote",
  };
}

function getPreviousPmQuotePoint(
  history: RequesterQuoteHistoryEntry[],
  primaryPoint: NegotiationPoint | null,
): NegotiationPoint | null {
  const pmMessages = history
    .flatMap((entry) => entry.messages)
    .filter((message) => message.authorLabel === "PM feedback")
    .filter((message) => message.expectedAmount != null || message.expectedDeliveryAt);

  if (!pmMessages.length) {
    return null;
  }

  const currentPmSignature =
    primaryPoint?.source === "pm"
      ? `${String(primaryPoint.amount ?? "")}|${primaryPoint.deliveryAt ?? ""}`
      : null;

  const previousPmMessage = [...pmMessages]
    .reverse()
    .find((message) => {
      if (!currentPmSignature) {
        return true;
      }

      return `${String(message.expectedAmount ?? "")}|${message.expectedDeliveryAt ?? ""}` !== currentPmSignature;
    });

  if (!previousPmMessage) {
    return null;
  }

  return {
    amount: previousPmMessage.expectedAmount ?? null,
    deliveryAt: previousPmMessage.expectedDeliveryAt ?? null,
    source: "pm",
  };
}
