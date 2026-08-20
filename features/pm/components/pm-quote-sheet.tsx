import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
export function PmQuoteSheet({
  quote,
}: {
  quote?: {
    currency?: string | null;
    total_amount?: number | string | null;
    breakdown_json?: unknown;
    pricing_snapshot?: unknown;
    quote_items?: Array<{ label: string; amount: number | string }> | null;
  } | null;
}) {
  return (
    <RequestQuoteSheet
      quote={quote}
      showEditAction
    />
  );
}
