import { RequestQuoteSheet } from "@/features/requester/components/request-quote-sheet";
import type { EpCountryOption, WizardConfig } from "@/features/requester/wizard-types";

export function PmQuoteSheet({
  config,
  translationWordCount,
  epCountries,
}: {
  config: WizardConfig;
  translationWordCount: number;
  epCountries: EpCountryOption[];
}) {
  return (
    <RequestQuoteSheet
      config={config}
      translationWordCount={translationWordCount}
      epCountries={epCountries}
      showEditAction
    />
  );
}
