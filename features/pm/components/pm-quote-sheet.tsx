import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
export function PmQuoteSheet({
  quote,
  isEpGranting = false,
  translationRequired = true,
  showHeader = true,
}: {
  quote?: {
    currency?: string | null;
    total_amount?: number | string | null;
    breakdown_json?: unknown;
    pricing_snapshot?: unknown;
    quote_items?: Array<{ label: string; amount: number | string }> | null;
  } | null;
  isEpGranting?: boolean;
  translationRequired?: boolean;
  showHeader?: boolean;
}) {
  return (
    <RequestQuoteSheet
      quote={quote}
      showEditAction
      showHeader={showHeader}
      isEpGranting={isEpGranting}
      translationRequired={translationRequired}
    />
  );
}
