import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
import type { ReactNode } from "react";
export function PmQuoteSheet({
  quote,
  quotes,
  isEpGranting = false,
  translationRequired = true,
  showHeader = true,
  editAction,
}: {
    quote?: {
      id?: string;
      version_no?: number;
      status?: string | null;
      notes?: string | null;
    currency?: string | null;
    total_amount?: number | string | null;
    breakdown_json?: unknown;
    pricing_snapshot?: unknown;
    quote_items?: Array<{ label: string; amount: number | string }> | null;
    } | null;
    quotes?: Array<{
      id?: string;
      version_no?: number;
      status?: string | null;
      notes?: string | null;
      currency?: string | null;
      total_amount?: number | string | null;
      breakdown_json?: unknown;
      pricing_snapshot?: unknown;
      quote_items?: Array<{ label: string; amount: number | string }> | null;
    }> | null;
  isEpGranting?: boolean;
  translationRequired?: boolean;
  showHeader?: boolean;
  editAction?: ReactNode;
}) {
  return (
    <RequestQuoteSheet
      quote={quote}
      quotes={quotes}
      editAction={editAction}
      showHeader={showHeader}
      isEpGranting={isEpGranting}
      translationRequired={translationRequired}
    />
  );
}
