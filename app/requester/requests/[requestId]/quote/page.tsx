import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CircleEllipsis } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QuoteNegotiationHistory } from "@/features/requester/components/quote-negotiation-history";
import { QuoteActions } from "@/features/requester/components/quote-actions";
import { RequesterHeader } from "@/features/requester/components/requester-header";
import { StatusBadge, formatCurrency, formatDate } from "@/features/requester/format";
import { RequesterStatusBadge } from "@/features/requester/requester-status";
import { getRequesterQuote } from "@/features/requester/queries";

type QuoteItem = {
  id: string;
  label: string;
  amount: number | string;
  description?: string | null;
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
    isWaitingForPmFeedback,
    negotiationHistory,
  } = await getRequesterQuote(requestId);

  if (!request) notFound();
  const items = (quote?.quote_items ?? []) as QuoteItem[];

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
                <p className="text-4xl font-semibold">{formatCurrency(quote.total_amount, quote.currency ?? "USD")}</p>
                <div className="grid gap-3 text-sm md:grid-cols-3">
                  <span className="flex items-center gap-2">
                    <span>Status</span>
                    {quote.status === "negotiating" ? (
                      <RequesterStatusBadge size="compact" status="negotiation" />
                    ) : (
                      <StatusBadge status={quote.status} />
                    )}
                  </span>
                  <span>Delivery {formatDate(quote.estimated_delivery_at)}</span>
                  <span>Valid until {formatDate(quote.valid_until)}</span>
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
