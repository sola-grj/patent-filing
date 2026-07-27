import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
import type { WizardConfig } from "@/features/requester/wizard-types";

export function PmQuoteSheet({
  config,
  translationWordCount,
}: {
  config: WizardConfig;
  translationWordCount: number;
}) {
  return (
    <RequestQuoteSheet
      config={config}
      translationWordCount={translationWordCount}
      showEditAction
    />
  );
}
